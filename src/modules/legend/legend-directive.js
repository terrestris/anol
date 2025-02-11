import './module.js';
import {asString as colorAsString} from 'ol/color';
import VectorLayer from 'ol/layer/Vector';

import templateHTML from './templates/legend.html';

angular.module('anol.legend')
    /**
     * @ngdoc directive
     * @name anol.legend.directive:anolLegend
     *
     * @restrict A
     * @requires anol.map.LayersService
     * @requires anol.map.ControlsService
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
    .directive('anolLegend', ['$templateRequest', '$compile', 'LayersService', 'ControlsService', 'CatalogService',
        function ($templateRequest, $compile, LayersService, ControlsService, CatalogService) {
            return {
                restrict: 'A',
                require: '?^anolMap',
                transclude: true,
                template: function (tElement, tAttrs) {
                    if (tAttrs.templateUrl) {
                        return '<div></div>';
                    }
                    return templateHTML;
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
                    pre: function (scope, element, attrs, AnolMapController) {
                        if (attrs.templateUrl && attrs.templateUrl !== '') {
                            $templateRequest(attrs.templateUrl).then(function (html) {
                                const template = angular.element(html);
                                element.html(template);
                                $compile(template)(scope);
                            });
                        }
                        scope.collapsed = false;
                        scope.showToggle = false;

                        //attribute defaults
                        scope.tooltipPlacement = angular.isDefined(scope.tooltipPlacement) ?
                            scope.tooltipPlacement : 'left';
                        scope.tooltipDelay = angular.isDefined(scope.tooltipDelay) ?
                            scope.tooltipDelay : 500;
                        scope.tooltipEnable = angular.isDefined(scope.tooltipEnable) ?
                            scope.tooltipEnable : !('ontouchstart' in window);
                        scope.showInactive = (scope.showInactive === true || scope.showInactive === 'true');

                        // get callback from wrapper function
                        if (angular.isFunction(scope.customTargetFilled())) {
                            scope.customTargetCallback = scope.customTargetFilled();
                        }
                        if (angular.isObject(AnolMapController)) {
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
                    post: function (scope, element, attrs) {
                        scope.legendLayers = [];
                        scope.visibleLayerNames = [];

                        function addLegendLayer(layer) {
                            if (angular.isUndefined(layer)) {
                                return true;
                            }
                            if (layer instanceof anol.layer.Group) {
                                const layers = [];
                                const group = layer;
                                angular.forEach(group.layers, function (overlayLayer) {
                                    if (overlayLayer.legend !== false) {
                                        layers.push(overlayLayer);
                                    }
                                });
                                if (layers.length >= 1 || group.legend) {
                                    scope.legendLayers.push({
                                        'group': group,
                                        'content': layers
                                    });
                                }
                            } else {
                                if (layer.legend !== false) {
                                    scope.legendLayers.push(layer);
                                }
                            }
                        }

                        scope.handleVisibleChange = function (evt) {
                            const layer = this;
                            if (layer.permalink === true) {
                                const _layerName = layer.name;
                                if (angular.isDefined(_layerName) && layer.getVisible() && layer.legend !== false) {
                                    scope.visibleLayerNames.push(_layerName);
                                } else {
                                    const _layerNameIdx = $.inArray(_layerName, scope.visibleLayerNames);
                                    if (_layerNameIdx > -1) {
                                        scope.visibleLayerNames.splice(_layerNameIdx, 1);
                                    }
                                }
                            }
                            if (layer.catalogLayer === true) {
                                const layerName = layer.name;
                                if (angular.isDefined(layerName) && layer.getVisible()) {
                                    scope.visibleLayerNames.push(layerName);
                                } else {
                                    const layerNameIdx = $.inArray(layerName, scope.visibleLayerNames);
                                    if (layerNameIdx > -1) {
                                        scope.visibleLayerNames.splice(layerNameIdx, 1);
                                    }
                                }
                            }
                        };

                        const self = this;
                        scope.$watchCollection(function () {
                            return LayersService.layers();
                        }, function (newVal, oldVal) {
                            if (angular.isDefined(newVal) && angular.isDefined(oldVal)) {
                                // reset legendLayers
                                scope.legendLayers = [];
                                scope.visibleLayerNames = [];
                                angular.forEach(newVal, function (layer) {
                                    if (angular.isUndefined(layer)) {
                                        return true;
                                    }
                                    addLegendLayer(layer);
                                    if (layer instanceof anol.layer.Group) {
                                        angular.forEach(layer.layers, function (groupLayer) {
                                            if (groupLayer.permalink === true) {
                                                groupLayer.offVisibleChange(scope.handleVisibleChange);
                                                groupLayer.onVisibleChange(scope.handleVisibleChange, self);
                                                if (groupLayer.getVisible() && groupLayer.legend !== false) {
                                                    scope.visibleLayerNames.push(groupLayer.name);
                                                }
                                            }
                                        });
                                    } else {
                                        if (layer.permalink === true) {
                                            layer.offVisibleChange(scope.handleVisibleChange);
                                            layer.onVisibleChange(scope.handleVisibleChange, self);
                                            if (layer.getVisible() && layer.legend !== false) {
                                                scope.visibleLayerNames.push(layer.name);
                                            }
                                        }
                                    }
                                });
                            }
                        });

                        scope.$watchCollection(function () {
                            return CatalogService.addedCatalogLayers();
                        }, function (newVal) {
                            if (angular.isDefined(newVal)) {
                                angular.forEach(newVal, function (layer) {
                                    layer.offVisibleChange(scope.handleVisibleChange);
                                    layer.onVisibleChange(scope.handleVisibleChange, self);
                                    if (layer.getVisible() && layer.legend !== false) {
                                        scope.visibleLayerNames.push(layer.name);
                                    }
                                });
                            }
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
    .directive('anolLegendImage', ['$compile', function ($compile) {
        return {
            restrict: 'A',
            scope: {
                legendLayer: '=anolLegendImage',
                customTargetFilled: '&',
                prepend: '=',
                size: '='
            },
            link: function (scope, element, attrs) {
                const VectorLegend = {
                    createCanvas: function () {
                        const canvas = angular.element('<canvas></canvas>');
                        canvas.addClass('anol-legend-item-image');
                        canvas[0].width = scope.width;
                        canvas[0].height = scope.height;
                        return canvas;
                    },
                    drawPointLegend: function (style) {
                        let ratio;
                        const canvas = VectorLegend.createCanvas();
                        const ctx = canvas[0].getContext('2d');

                        if (angular.isFunction(style.getImage().getSrc)) {
                            let width, height;
                            const iconSize = style.getImage().getSize();
                            if (scope.width >= scope.height) {
                                ratio = iconSize[0] / iconSize[1];
                                width = scope.width * ratio;
                                height = scope.height;
                            } else {
                                ratio = iconSize[1] / iconSize[0];
                                height = scope.height * ratio;
                                width = scope.width;
                            }
                            const img = new Image();
                            img.src = style.getImage().getSrc();

                            const positionLeft = (scope.width - width) / 2;
                            const positionTop = (scope.height - height) / 2;
                            img.onload = function () {
                                ctx.drawImage(img, positionLeft, positionTop, width, height);
                            };
                        } else {
                            const x = scope.width / 2;
                            const y = scope.height / 2;
                            const r = (Math.min(scope.width, scope.height) / 2) - 2;
                            ratio = r / style.getImage().getRadius();
                            ctx.arc(x, y, r, 0, 2 * Math.PI, false);
                            ctx.strokeStyle = colorAsString(style.getImage().getStroke().getColor());
                            ctx.lineWidth = style.getImage().getStroke().getWidth() * ratio;
                            ctx.fillStyle = colorAsString(style.getImage().getFill().getColor());
                            ctx.fill();
                            ctx.stroke();
                        }
                        return canvas;
                    },
                    drawLineLegend: function (style) {
                        const canvas = VectorLegend.createCanvas();
                        const ctx = canvas[0].getContext('2d');
                        const minX = 2;
                        const maxX = scope.width - 2;
                        const y = scope.height / 2;
                        ctx.moveTo(minX, y);
                        ctx.lineTo(maxX, y);
                        ctx.strokeStyle = colorAsString(style.getStroke().getColor());
                        ctx.lineWidth = style.getStroke().getWidth();
                        ctx.stroke();
                        return canvas;
                    },
                    drawPolygonLegend: function (style) {
                        const canvas = VectorLegend.createCanvas();
                        const ctx = canvas[0].getContext('2d');

                        const minX = 1;
                        const minY = 1;
                        const maxX = scope.width - 2;
                        const maxY = scope.height - 2;
                        ctx.rect(minX, minY, maxX, maxY);
                        ctx.fillStyle = colorAsString(style.getFill().getColor());
                        ctx.strokeStyle = colorAsString(style.getStroke().getColor());
                        ctx.lineWidth = style.getStroke().getWidth();
                        ctx.fill();
                        ctx.stroke();
                        return canvas;
                    },
                    createLegendEntry: function (title, type, style) {
                        if (angular.isFunction(style)) {
                            style = style()[0];
                        }
                        switch (type) {
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

                const RasterLegend = {
                    createLegendEntry: function (layer) {
                        const legendImages = $('<div></div>');
                        if (angular.isUndefined(layer.getLegendGraphicUrl)) {
                            return;
                        }
                        const legendImage = $('<img>');
                        legendImage.addClass('anol-legend-item-image');
                        legendImage.attr('src', layer.getLegendGraphicUrl());
                        legendImages.append(legendImage);

                        // Display in element with given id
                        if (angular.isDefined(layer.legend.target)) {
                            const target = angular.element(layer.legend.target);
                            const showLegendButton = angular.element('<button>{{ \'anol.legend.SHOW\' | translate }}</button>');
                            showLegendButton.addClass('btn');
                            showLegendButton.addClass('btn-sm');
                            showLegendButton.on('click', function () {
                                target.empty();
                                target.append(legendImages);
                                if (angular.isFunction(scope.customTargetCallback)) {
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

                const ImageLegend = {
                    createLegendEntry: function (title, url) {
                        const legendImage = angular.element('<img>');
                        legendImage.addClass('anol-legend-item-image');
                        legendImage[0].src = url;
                        return legendImage;
                    }
                };

                if (angular.isFunction(scope.customTargetFilled())) {
                    scope.customTargetCallback = scope.customTargetFilled();
                }
                if (angular.isArray(scope.size)) {
                    scope.width = scope.size[0];
                    scope.height = scope.size[1];
                } else {
                    scope.width = 20;
                    scope.height = 20;
                }

                let legendItem;

                if (angular.isDefined(scope.legendLayer.legend.url)) {
                    legendItem = ImageLegend.createLegendEntry(scope.legendLayer.title, scope.legendLayer.legend.url);
                } else if (scope.legendLayer.olLayer instanceof VectorLayer) {
                    legendItem = VectorLegend.createLegendEntry(
                        scope.legendLayer.title,
                        scope.legendLayer.legend.type,
                        scope.legendLayer.olLayer.getStyle()
                    );
                } else {
                    legendItem = RasterLegend.createLegendEntry(scope.legendLayer);
                }
                if (scope.prepend === true) {
                    element.prepend(legendItem);
                } else {
                    element.append(legendItem);
                }
            }
        };
    }]);
