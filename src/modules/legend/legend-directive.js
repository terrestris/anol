angular.module('anol.legend')
/**
 * @ngdoc directive
 * @name anol.legend.directive:anolLegend
 *
 * @restrict A
 * @requires anol.map.LayersService
 * @requires anol.map.ControlsSerivce
 *
 * @param {string} anolLegend If containing "open" legend initial state is expanded. Otherweise it is collapsed.
 * @param {function} customTargetFilled
 * @param {string} tooltipPlacement Position of tooltip
 * @param {number} tooltipDelay Time in milisecounds to wait before display tooltip
 * @param {boolean} tooltipEnable Enable tooltips. Default true for non-touch screens, default false for touchscreens}
 * @param {string} templateUrl Url to template to use instead of default one
 * @param {boolean} showInactive If true a legend item for not visible layers with legend options is also created
 *
 * @description
 * Adds a legend to map
 */
.directive('anolLegend', ['LayersService', 'ControlsService', function(LayersService, ControlsService) {
    return {
        restrict: 'A',
        require: '?^anolMap',
        transclude: true,
        templateUrl: function(tElement, tAttrs) {
          var defaultUrl = 'src/modules/legend/templates/legend.html';
          return tAttrs.templateUrl || defaultUrl;
        },
        scope: {
            anolLegend: '@',
            // TODO compare with featurepopup openCallback. Why a callback wrapper is added here?
            customTargetFilled: '&',
            tooltipPlacement: '@',
            tooltipDelay: '@',
            tooltipEnable: '@',
            showInactive: '@'
        },
        link: {
            pre: function(scope, element, attrs, AnolMapController) {
                scope.collapsed = false;
                scope.showToggle = false;

                //attribute defaults
                scope.tooltipPlacement = angular.isDefined(scope.tooltipPlacement) ?
                    scope.tooltipPlacement : 'left';
                scope.tooltipDelay = angular.isDefined(scope.tooltipDelay) ?
                    scope.tooltipDelay : 500;
                scope.tooltipEnable = angular.isDefined(scope.tooltipEnable) ?
                    scope.tooltipEnable : !ol.has.TOUCH;
                scope.showInactive = (scope.showInactive === true || scope.showInactive === 'true');

                // get callback from wrapper function
                if(angular.isFunction(scope.customTargetFilled())) {
                    scope.customTargetCallback = scope.customTargetFilled();
                }
                if(angular.isObject(AnolMapController)) {
                    scope.collapsed = scope.anolLegend !== 'open';
                    scope.showToggle = true;
                    element.addClass('anol-legend');
                    ControlsService.addControl(
                        new anol.control.Control({
                            element: element
                        })
                    );
                }
            },
            post: function(scope, element, attrs) {
                scope.legendLayers = [];

                angular.forEach(LayersService.flattedLayers(), function(layer) {
                    if(layer.legend === false) {
                        return;
                    }
                    scope.legendLayers.push(layer);
                });
            }
        }
    };
}])

/**
 * @ngdoc directive
 * @name anol.legend.directive:anolLegendImage
 *
 * @restrict A
 * @requires $compile
 *
 * @param {anol.layer} anolLegendImage Layer to add legend image for.
 * @param {function} customTargetFilled Callback for show legend button
 * @param {boolean} prepend Add legend image before (true) or after (false) transcluded element(s)
 * @param {Array<number>} size Size of canvas when generating legend image for vector layer
 *
 * @description
 * Creates a legend image based on layer.legend configuration.
 * When url is defined in layer.legend, an image with src = layer.legend.url is appended to legend.
 * The url property is available for all types of layers.
 * For vector layers layer.legend.type can be one of `point`, `line` or `polygon`. A legend entry depending on layer style is created.
 * For raster layers with defined layer.legend a legend entry with result of getLegendGraphic request is created.
 * For raster layers, if layer.legend.target points to a html element class or id, a button is rendered instead of legend image. After button pressed
 * legend image is shown in element with given id/class.
 */
.directive('anolLegendImage', ['$compile', function($compile) {
    return {
        restrict: 'A',
        scope: {
            legendLayer: '=anolLegendImage',
            customTargetFilled: '&',
            prepend: '=',
            size: '='
        },
        link: function(scope, element, attrs) {
            var VectorLegend = {
                createCanvas: function() {
                    var canvas = angular.element('<canvas></canvas>');
                    canvas.addClass('anol-legend-item-image');
                    canvas[0].width = scope.width;
                    canvas[0].height = scope.height;
                    return canvas;
                },
                drawPointLegend: function(style) {
                    var ratio;
                    var canvas = VectorLegend.createCanvas();
                    var ctx = canvas[0].getContext('2d');

                    if(angular.isFunction(style.getImage().getSrc)) {
                        var width, height;
                        var iconSize = style.getImage().getSize();
                        if(scope.width >= scope.height) {
                            ratio = iconSize[0] / iconSize[1];
                            width = scope.width * ratio;
                            height = scope.height;
                        } else {
                            ratio = iconSize[1] / iconSize[0];
                            height = scope.height * ratio;
                            width = scope.width;
                        }
                        var img = new Image();
                        img.src = style.getImage().getSrc();

                        var positionLeft = (scope.width - width) / 2;
                        var positionTop = (scope.height - height) / 2;
                        img.onload = function() {
                            ctx.drawImage(img, positionLeft, positionTop, width, height);
                        };
                    } else {
                        var x = scope.width / 2;
                        var y = scope.height / 2;
                        var r = (Math.min(scope.width, scope.height) / 2) - 2;
                        ratio = r / style.getImage().getRadius();
                        ctx.arc(x, y, r, 0, 2 * Math.PI, false);
                        ctx.strokeStyle = ol.color.asString(style.getImage().getStroke().getColor());
                        ctx.lineWidth = style.getImage().getStroke().getWidth() * ratio;
                        ctx.fillStyle = ol.color.asString(style.getImage().getFill().getColor());
                        ctx.fill();
                        ctx.stroke();
                    }
                    return canvas;
                },
                drawLineLegend: function(style) {
                    var canvas = VectorLegend.createCanvas();
                    var ctx = canvas[0].getContext('2d');
                    var minX = 2;
                    var maxX = scope.width - 2;
                    var y = scope.height / 2;
                    ctx.moveTo(minX, y);
                    ctx.lineTo(maxX, y);
                    ctx.strokeStyle = ol.color.asString(style.getStroke().getColor());
                    ctx.lineWidth = style.getStroke().getWidth();
                    ctx.stroke();
                    return canvas;
                },
                drawPolygonLegend: function(style) {
                    var canvas = VectorLegend.createCanvas();
                    var ctx = canvas[0].getContext('2d');

                    var minX = 1;
                    var minY = 1;
                    var maxX = scope.width - 2;
                    var maxY = scope.height - 2;
                    ctx.rect(minX, minY, maxX, maxY);
                    ctx.fillStyle = ol.color.asString(style.getFill().getColor());
                    ctx.strokeStyle = ol.color.asString(style.getStroke().getColor());
                    ctx.lineWidth = style.getStroke().getWidth();
                    ctx.fill();
                    ctx.stroke();
                    return canvas;
                },
                createLegendEntry: function(title, type, style) {
                    if(angular.isFunction(style)) {
                        style = style()[0];
                    }
                    switch(type) {
                        case 'point':
                            return VectorLegend.drawPointLegend(style);
                        case 'line':
                            return VectorLegend.drawLineLegend(style);
                        case 'polygon':
                            return VectorLegend.drawPolygonLegend(style);
                        default:
                            return;
                    }
                }
            };

            var RasterLegend = {
                createLegendEntry: function(layer) {
                    var legendImages = $('<div></div>');
                    if(layer.getLegendGraphicUrl === undefined) {
                        return;
                    }
                    var legendImage = $('<img>');
                    legendImage.addClass('anol-legend-item-image');
                    legendImage.attr('src', layer.getLegendGraphicUrl());
                    legendImages.append(legendImage);

                    // Display in element with given id
                    if (angular.isDefined(layer.legend.target)) {
                        var target = angular.element(layer.legend.target);
                        var showLegendButton = angular.element('<button>{{ \'anol.legend.SHOW\' | translate }}</button>');
                        showLegendButton.addClass('btn');
                        showLegendButton.addClass('btn-sm');
                        showLegendButton.on('click', function() {
                            target.empty();
                            target.append(legendImages);
                            if(angular.isFunction(scope.customTargetCallback)) {
                                scope.customTargetCallback();
                            }
                        });
                        return $compile(showLegendButton)(scope);
                    // Display in legend control
                    } else {
                        return legendImages;
                    }
                }
            };

            var ImageLegend = {
                createLegendEntry: function(title, url) {
                    var legendImage = angular.element('<img>');
                    legendImage.addClass('anol-legend-item-image');
                    legendImage[0].src = url;
                    return legendImage;
                }
            };

            if(angular.isFunction(scope.customTargetFilled())) {
                scope.customTargetCallback = scope.customTargetFilled();
            }
            if(angular.isArray(scope.size)) {
                scope.width = scope.size[0];
                scope.height = scope.size[1];
            } else {
                scope.width = 20;
                scope.height = 20;
            }

            var legendItem;

            if(scope.legendLayer.legend.url !== undefined) {
                legendItem = ImageLegend.createLegendEntry(scope.legendLayer.title, scope.legendLayer.legend.url);
            } else if(scope.legendLayer.olLayer instanceof ol.layer.Vector) {
                legendItem = VectorLegend.createLegendEntry(
                    scope.legendLayer.title,
                    scope.legendLayer.legend.type,
                    scope.legendLayer.olLayer.getStyle()
                );
            } else {
                legendItem = RasterLegend.createLegendEntry(scope.legendLayer);
            }
            if(scope.prepend === true) {
                element.prepend(legendItem);
            } else {
                element.append(legendItem);
            }
        }
    };
}]);
