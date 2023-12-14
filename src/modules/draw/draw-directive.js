import './module.js';
import '../util.js';
import {DigitizeState} from "../savemanager/digitize-state";

import {TOUCH as hasTouch} from 'ol/has';
import Draw from 'ol/interaction/Draw';
import Select from 'ol/interaction/Select';
import Modify from 'ol/interaction/Modify';
import Snap from 'ol/interaction/Snap';
import {never as neverCondition, singleClick} from 'ol/events/condition';
import Style, {createEditingStyle} from 'ol/style/Style';
import Fill from 'ol/style/Fill';
import Stroke from 'ol/style/Stroke';
import Text from 'ol/style/Text';

angular.module('anol.draw')
    /**
     * @ngdoc directive
     * @name anol.draw.anolDraw
     *
     * @requires $compile
     * @requires $rootScope
     * @requires $translate
     * @requires anol.map.MapService
     * @requires anol.map.ControlsSerivce
     * @requires anol.map.DrawService
     *
     * @param {object} geometries The configuration of the geometries (e.g. min/max values).
     * @param {boolean} continueDrawing Don't deactivate drawing after feature is added
     * @param {function} postDrawAction Action to call after feature is drawn. Draw control will be deactivated when postDrawAction defined.
     * @param {boolean} freeDrawing Deactivate snapped drawing
     * @param {string} pointTooltipPlacement Position of point tooltip
     * @param {string} lineTooltipPlacement Position of line tooltip
     * @param {string} polygonTooltipPlacement Position of polygon tooltip
     * @param {number} tooltipDelay Time in milisecounds to wait before display tooltip
     * @param {boolean} tooltipEnable Enable tooltips. Default true for non-touch screens, default false for touchscreens
     * @param {boolean} liveMeasure Display length / area information, default: false
     * @param {string} templateUrl Url to template to use instead of default one
     *
     * @description
     * Provides controls to draw points, lines and polygons, modify and remove them
     */
    .directive('anolDraw', ['$templateRequest', '$compile', '$rootScope', '$translate', '$timeout', '$olOn', '$document', 'ControlsService', 'MapService', 'DrawService', 'MeasureService',
        function ($templateRequest, $compile, $rootScope, $translate, $timeout, $olOn, $document, ControlsService, MapService, DrawService, MeasureService) {
            return {
                restrict: 'A',
                require: '?^anolMap',
                scope: {
                    geometries: '=',
                    continueDrawing: '@',
                    postDrawAction: '&?',
                    onModifySelect: '&?',
                    postDeleteAction: '&?',
                    freeDrawing: '@',
                    tooltipDelay: '@',
                    tooltipEnable: '@',
                    pointTooltipPlacement: '@',
                    lineTooltipPlacement: '@',
                    polygonTooltipPlacement: '@',
                    liveMeasure: '<',
                    shortText: '<?',
                    drawTitle: '<?',
                    modifyLabel: '<?',
                    removeLabel: '<?',
                    setState: '<?'
                },
                template: function (tElement, tAttrs) {
                    if (tAttrs.templateUrl) {
                        return '<div></div>';
                    }
                    return require('./templates/draw.html');
                },
                link: function (scope, element, attrs, AnolMapController) {
                    if (attrs.templateUrl && attrs.templateUrl !== '') {
                        $templateRequest(attrs.templateUrl).then(function (html) {
                            var template = angular.element(html);
                            element.html(template);
                            $compile(template)(scope);
                        });
                    }
                    // attribute defaults
                    scope.geometriesConfig = applyGeometriesConfig(scope.geometries);
                    scope.continueDrawing = angular.isDefined(scope.continueDrawing) ?
                        scope.continueDrawing : false;
                    scope.freeDrawing = angular.isDefined(scope.freeDrawing) ?
                        scope.freeDrawing : false;
                    scope.tooltipEnable = angular.isDefined(scope.tooltipEnable) ?
                        scope.tooltipEnable : !hasTouch;
                    scope.tooltipDelay = angular.isDefined(scope.tooltipDelay) ?
                        scope.tooltipDelay : 500;
                    scope.pointTooltipPlacement = angular.isDefined(scope.pointTooltipPlacement) ?
                        scope.pointTooltipPlacement : 'right';
                    scope.lineTooltipPlacement = angular.isDefined(scope.lineTooltipPlacement) ?
                        scope.lineTooltipPlacement : 'right';
                    scope.polygonTooltipPlacement = angular.isDefined(scope.polygonTooltipPlacement) ?
                        scope.polygonTooltipPlacement : 'right';
                    scope.shortText = angular.isDefined(scope.shortText) ?
                        scope.shortText : false;
                    scope.setState = angular.isDefined(scope.setState) ?
                        scope.setState : false;

                    scope.activeLayer = undefined;
                    scope.selectedFeature = undefined;
                    scope.modifyActive = false;
                    scope.removeActive = false;
                    scope.badgeTexts = {};
                    scope.activeDrawType = undefined;
                    translateBadgeTexts();

                    var controls = [];
                    var drawPointControl, drawLineControl, drawPolygonControl, modifyControl;

                    function translateBadgeTexts() {
                        $translate([
                            'anol.draw.BADGE_CURRENT',
                            'anol.draw.BADGE_MIN',
                            'anol.draw.BADGE_MAX'
                        ]).then(function (translations) {
                            scope.badgeTexts = {
                                current: scope.shortText ? '#' : translations['anol.draw.BADGE_CURRENT'],
                                min: translations['anol.draw.BADGE_MIN'],
                                max: translations['anol.draw.BADGE_MAX']
                            };
                        });
                    }

                    function applyGeometriesConfig(geometries = {}) {
                        var defaultVals = {
                            enabled: true,
                            min: 0,
                            max: Infinity
                        };

                        var defaultGeometries = {
                            point: angular.copy(defaultVals),
                            line: angular.copy(defaultVals),
                            polygon: angular.copy(defaultVals)
                        };

                        return angular.merge(defaultGeometries, geometries);
                    }

                    var executePostDrawCallback = function (evt) {
                        if (scope.setState) {
                            evt.feature.set('_digitizeState', DigitizeState.NEW);
                        }
                        if (angular.isFunction(scope.postDrawAction)) {
                            scope.postDrawAction({layer: scope.activeLayer, feature: evt.feature});
                        }
                    };

                    let overlayAdded = false;

                    function ensureMeasureOverlayAdded() {
                        if (!overlayAdded) {
                            scope.map.addOverlay(scope.measureOverlay);
                        }
                        overlayAdded = true;
                    }

                    function ensureMeasureOverlayRemoved() {
                        if (overlayAdded) {
                            scope.map.removeOverlay(scope.measureOverlay);
                            overlayAdded = false;
                        }
                    }

                    const editingStyles = createEditingStyle();
                    const measureStyle = MeasureService.createMeasureStyle([
                        ...editingStyles['Point'],
                        ...editingStyles['LineString']
                    ], new Style({
                        text: new Text({
                            font: '14px Calibri,sans-serif',
                            fill: new Fill({
                                color: '#000'
                            }),
                            stroke: new Stroke({
                                color: '#fff',
                                width: 2
                            })
                        })
                    }), editingStyles['Point'][0], true);

                    var createDrawInteractions = function (drawType, source, control, layer, postDrawActions) {
                        postDrawActions = postDrawActions || [];

                        // create draw interaction
                        var draw = new Draw({
                            source: source,
                            type: drawType,
                            stopClick: true,
                            style: !scope.liveMeasure ? undefined : function (feature) {
                                const geometry = feature.getGeometry();
                                // TODO document behaviour of style function in OpenLayers
                                // Point: 1 invocation
                                //  - with point feature
                                // LineString: 2 invocations
                                //  - with point feature
                                //  - with line feature
                                // Polygon: 3 invocations
                                //  - with point feature
                                //  - with line feature
                                //  - with polygon feature
                                if (drawType !== 'Point' && geometry.getType() === drawType) {
                                    const projection = MapService.getMap().getView().getProjection();
                                    if (drawType === 'LineString') {
                                        scope.measureOverlay.getElement().innerHTML =
                                            MeasureService.formatLineResult(geometry, projection, false);
                                    } else if (drawType === 'Polygon') {
                                        scope.measureOverlay.getElement().innerHTML =
                                            MeasureService.formatAreaResult(geometry, projection, false, true);
                                    }
                                    scope.measureOverlay.setPosition(geometry.getLastCoordinate());
                                    ensureMeasureOverlayAdded();
                                }
                                return measureStyle(feature);
                            }
                        });

                        postDrawActions.push(ensureMeasureOverlayRemoved);
                        postDrawActions.push(executePostDrawCallback);

                        if (scope.continueDrawing === false && angular.isDefined(control)) {
                            postDrawActions.push(function () {
                                control.deactivate();
                            });
                        }

                        $olOn(draw, 'drawend', function () {
                            scope.activeDrawType = undefined;
                        });

                        // bind post draw actions
                        angular.forEach(postDrawActions, function (postDrawAction) {
                            $olOn(draw, 'drawend', postDrawAction);
                        });

                        var interactions = [draw];
                        if (scope.freeDrawing !== false) {
                            var snapInteraction = new Snap({
                                source: layer.getSource()
                            });
                            interactions.push(snapInteraction);
                        }
                        return interactions;
                    };

                    var createModifyInteractions = function (layer) {
                        var selectInteraction = new Select({
                            toggleCondition: neverCondition,
                            layers: [layer],
                            style: !scope.liveMeasure ? undefined : function (feature) {
                                const geometry = feature.getGeometry();
                                if (geometry.getType() !== 'Point') {
                                    const projection = MapService.getMap().getView().getProjection();
                                    if (geometry.getType() === 'LineString') {
                                        scope.measureOverlay.getElement().innerHTML =
                                            MeasureService.formatLineResult(geometry, projection, false);
                                    } else if (geometry.getType() === 'Polygon') {
                                        scope.measureOverlay.getElement().innerHTML =
                                            MeasureService.formatAreaResult(geometry, projection, false, true);
                                    }
                                    ensureMeasureOverlayAdded();
                                    scope.measureOverlay.setPosition(geometry.getLastCoordinate());
                                }
                                return measureStyle(feature);
                            },
                            filter: feature => feature.get('_digitizeState') !== DigitizeState.REMOVED,
                            hitTolerance: 10
                        });
                        $olOn(selectInteraction, 'select', function (evt) {
                            if (evt.selected.length === 0) {
                                scope.selectedFeature = undefined;
                                ensureMeasureOverlayRemoved();
                            } else {
                                const feat = evt.selected[0];
                                if (scope.removeActive) {
                                    // only mark existing features as removed
                                    if (scope.setState && feat.getId() !== undefined) {
                                        feat.set('_digitizeState', DigitizeState.REMOVED);
                                    } else {
                                        layer.getSource().removeFeature(feat);
                                    }
                                    if (angular.isFunction(scope.postDeleteAction)) {
                                        scope.postDeleteAction({feature: feat, layer: layer});
                                    }
                                    scope.toggleRemove();
                                } else {
                                    scope.selectedFeature = feat;
                                    if (angular.isFunction(scope.onModifySelect)) {
                                        scope.onModifySelect({
                                            layer: scope.activeLayer,
                                            feature: feat
                                        });
                                    }
                                }
                            }
                        });
                        var modifyInteraction = new Modify({
                            features: selectInteraction.getFeatures(),
                            deleteCondition: mapBrowserEvent => {
                                return singleClick(mapBrowserEvent);
                            }
                        });
                        $olOn(modifyInteraction, 'modifystart', e => {
                            if (scope.setState) {
                                for (const feature of e.features.getArray()) {
                                    if (feature.get('_digitizeState') !== DigitizeState.NEW) {
                                        feature.set('_digitizeState', DigitizeState.CHANGED);
                                    }
                                }
                            }
                        })
                        var snapInteraction = new Snap({
                            source: layer.getSource()
                        });
                        return [snapInteraction, selectInteraction, modifyInteraction];
                    };

                    var createDrawControl = function (controlElement, controlTarget) {
                        var controlOptions = {
                            element: controlElement,
                            target: controlTarget,
                            exclusive: true,
                            disabled: true
                        };
                        if (AnolMapController === null) {
                            controlOptions.olControl = null;
                        }
                        var drawControl = new anol.control.Control(controlOptions);
                        drawControl.onDeactivate(deactivate, scope);
                        drawControl.onActivate(activate, scope);
                        return drawControl;
                    };

                    var createModifyControl = function (controlElement, controlTarget) {
                        var controlOptions = {
                            element: controlElement,
                            target: controlTarget,
                            exclusive: true,
                            disabled: true
                        };
                        if (AnolMapController === null) {
                            controlOptions.olControl = null;
                        }
                        var _modifyControl = new anol.control.Control(controlOptions);

                        // modifyControl adds all interactions needed at activate time
                        // otherwise, a feature added programmatically is not selectable
                        // until modify control is enabled twice by user
                        // reproducible with featureexchange module when uploading a geojson
                        // and try to select uploaded feature for modify
                        _modifyControl.onDeactivate(function (targetControl) {
                            angular.forEach(targetControl.interactions, function (interaction) {
                                interaction.setActive(false);
                                MapService.getMap().removeInteraction(interaction);
                            });
                        });
                        _modifyControl.onActivate(function (targetControl) {
                            targetControl.interactions = createModifyInteractions(scope.activeLayer.olLayer);
                            angular.forEach(targetControl.interactions, function (interaction) {
                                interaction.setActive(true);
                                scope.map.addInteraction(interaction);
                            });
                        });
                        _modifyControl.onDeactivate(function () {
                            unselectFeature();
                        });
                        return _modifyControl;
                    };

                    var deactivate = function (targetControl) {
                        angular.forEach(targetControl.interactions, function (interaction) {
                            interaction.setActive(false);
                        });
                    };

                    var activate = function (targetControl) {
                        angular.forEach(targetControl.interactions, function (interaction) {
                            interaction.setActive(true);
                        });
                    };

                    var changeCursorCondition = function (pixel) {
                        return scope.map.hasFeatureAtPixel(pixel, {
                            layerFunction: function (layer) {
                                return layer === scope.activeLayer.olLayer;
                            },
                            hitTolerance: 10
                        });
                    };

                    var unselectFeature = function () {
                        var select = modifyControl.interactions.find(function (i) {
                            return i instanceof Select;
                        });
                        if (select) {
                            select.getFeatures().clear();
                        }
                        scope.selectedFeature = undefined;
                    };

                    // Button binds
                    scope.drawPoint = function () {
                        scope.modifyEnabled = false;
                        scope.modifyActive = false;
                        if (drawPointControl.disabled === true) {
                            return;
                        }
                        if (drawPointControl.active) {
                            scope.activeDrawType = undefined;
                            drawPointControl.deactivate();
                        } else {
                            scope.activeDrawType = 'Point';
                            drawPointControl.activate();
                        }
                    };

                    scope.drawLine = function () {
                        scope.modifyEnabled = false;
                        scope.modifyActive = false;
                        if (drawLineControl.disabled === true) {
                            return;
                        }
                        if (drawLineControl.active) {
                            scope.activeDrawType = undefined;
                            drawLineControl.deactivate();
                        } else {
                            scope.activeDrawType = 'LineString';
                            drawLineControl.activate();
                        }
                    };

                    scope.drawPolygon = function () {
                        scope.modifyEnabled = false;
                        scope.modifyActive = false;
                        if (drawPolygonControl.disabled === true) {
                            return;
                        }
                        if (drawPolygonControl.active) {
                            scope.activeDrawType = undefined;
                            drawPolygonControl.deactivate();
                        } else {
                            scope.activeDrawType = 'Polygon';
                            drawPolygonControl.activate();
                        }
                    };

                    scope.toggleModify = function () {
                        scope.removeActive = false;
                        scope.modifyActive = !scope.modifyActive;
                        if (modifyControl.disabled === true) {
                            return;
                        }
                        if (scope.modifyActive) {
                            modifyControl.activate();
                        } else {
                            modifyControl.deactivate();
                            ensureMeasureOverlayRemoved();
                        }
                    };

                    scope.toggleRemove = function () {
                        scope.modifyActive = false;
                        unselectFeature();
                        ensureMeasureOverlayRemoved();
                        scope.removeActive = !scope.removeActive;
                        if (modifyControl.disabled === true) {
                            return;
                        }
                        if (scope.removeActive) {
                            modifyControl.activate();
                        } else {
                            modifyControl.deactivate();
                        }
                    };

                    // extra action for a really customised draw experience
                    scope.drawCustom = function (drawType, postDrawCallback) {
                        // skip when no active layer present
                        if (angular.isUndefined(scope.activeLayer)) {
                            return;
                        }
                        scope.activeDrawType = 'Text';
                        // deactivate other controls
                        angular.forEach(controls, function (control) {
                            control.deactivate();
                        });

                        var olLayer = scope.activeLayer.olLayer;
                        var source = olLayer.getSource();
                        var customDrawControl = new anol.control.Control({
                            exclusive: true,
                            olControl: null
                        });
                        // stores control activate event handler unregistering informations
                        var unregisters = [];
                        var deregisterActiveLayerChange;
                        var customInteractions;
                        var removeCustomDraw = function () {
                            angular.forEach(customInteractions, function (interaction) {
                                interaction.setActive(false);
                                scope.map.removeInteraction(interaction);
                            });
                            deregisterActiveLayerChange();
                            angular.forEach(unregisters, function (unregister) {
                                unregister[0].unActivate(unregister[1]);
                            });

                            customDrawControl.deactivate();
                            ControlsService.removeControl(customDrawControl);
                        };

                        // call the callback function
                        var postDrawAction = function (evt) {
                            scope.activeDrawType = undefined;
                            postDrawCallback(scope.activeLayer, evt.feature);
                        };
                        // remove custom draw after draw finish
                        var postDrawRemoveCustomDraw = function () {
                            // TODO remove when https://github.com/openlayers/ol3/issues/3610/ resolved
                            $timeout(function () {
                                removeCustomDraw();
                            }, 275);
                        };

                        // third param is control we don't need for this action
                        customInteractions = createDrawInteractions(drawType, source, undefined, olLayer, [postDrawAction, postDrawRemoveCustomDraw]);

                        // remove custom draw when active layer changes
                        deregisterActiveLayerChange = scope.$watch(function () {
                            return DrawService.activeLayer;
                        }, function (newActiveLayer) {
                            if (newActiveLayer === scope.activeLayer && newActiveLayer !== undefined) {
                                return;
                            }
                            removeCustomDraw();
                        });

                        // remove custom draw when one of the other controls get active
                        angular.forEach(controls, function (control) {
                            unregisters.push([control, control.oneActivate(function () {
                                removeCustomDraw();
                            })]);
                        });

                        // activate and add customInteractions
                        angular.forEach(customInteractions, function (interaction) {
                            interaction.setActive(true);
                            scope.map.addInteraction(interaction);
                        });
                        ControlsService.addControl(customDrawControl);
                        customDrawControl.activate();
                        return removeCustomDraw;
                    };

                    scope.map = MapService.getMap();
                    scope.measureOverlay = MeasureService.createMeasureOverlay();

                    element.addClass('anol-draw');

                    if (AnolMapController !== null) {
                        element.addClass('ol-control');
                        var drawControl = new anol.control.Control({
                            element: element
                        });
                        controls.push(drawControl);
                    }

                    drawPointControl = createDrawControl(
                        element.find('.draw-point'),
                        element
                    );
                    controls.push(drawPointControl);

                    drawLineControl = createDrawControl(
                        element.find('.draw-line'),
                        element
                    );
                    controls.push(drawLineControl);

                    drawPolygonControl = createDrawControl(
                        element.find('.draw-polygon'),
                        element
                    );
                    controls.push(drawPolygonControl);

                    modifyControl = createModifyControl(
                        element.find('.draw-modify'),
                        element
                    );
                    modifyControl.onActivate(function () {
                        MapService.addCursorPointerCondition(changeCursorCondition);
                    });
                    modifyControl.onDeactivate(function () {
                        MapService.removeCursorPointerCondition(changeCursorCondition);
                    });
                    controls.push(modifyControl);

                    ControlsService.addControls(controls);

                    var allInteractions = function () {
                        return drawPointControl.interactions
                            .concat(drawLineControl.interactions)
                            .concat(drawPolygonControl.interactions)
                            .concat(modifyControl.interactions);
                    };

                    var updateGeometryCount = function () {
                        scope.geometryCount = {
                            point: DrawService.countFeaturesFor('Point'),
                            line: DrawService.countFeaturesFor('LineString'),
                            polygon: DrawService.countFeaturesFor('Polygon')
                        }
                    };

                    var visibleDewatcher;

                    var bindActiveLayer = function (layer) {
                        drawPointControl.interactions = createDrawInteractions(
                            'Point', layer.olLayer.getSource(), drawPointControl, layer.olLayer);
                        drawPointControl.enable();
                        drawLineControl.interactions = createDrawInteractions(
                            'LineString', layer.olLayer.getSource(), drawLineControl, layer.olLayer);
                        drawLineControl.enable();
                        drawPolygonControl.interactions = createDrawInteractions(
                            'Polygon', layer.olLayer.getSource(), drawPolygonControl, layer.olLayer);
                        drawPolygonControl.enable();
                        modifyControl.enable();

                        angular.forEach(allInteractions(), function (interaction) {
                            interaction.setActive(false);
                            scope.map.addInteraction(interaction);
                        });

                        scope.activeLayer = layer;
                        // inital setup in case the active layer already contains features
                        updateGeometryCount();

                        $olOn(scope.activeLayer.olLayer.getSource(), 'change', updateGeometryCount);

                        visibleDewatcher = scope.$watch(function () {
                            return scope.activeLayer.getVisible();
                        }, function (n) {
                            if (n === false) {
                                DrawService.changeLayer(undefined);
                            }
                        });
                    };

                    var unbindActiveLayer = function () {
                        angular.forEach(allInteractions(), function (interaction) {
                            interaction.setActive(false);
                            scope.map.removeInteraction(interaction);
                        });

                        drawPointControl.disable();
                        drawPointControl.interactions = [];
                        drawLineControl.disable();
                        drawLineControl.interactions = [];
                        drawPolygonControl.disable();
                        drawPolygonControl.interactions = [];
                        modifyControl.disable();
                        modifyControl.interactions = [];

                        if (angular.isDefined(visibleDewatcher)) {
                            visibleDewatcher();
                        }

                        if (scope.activeLayer && scope.activeLayer.olLayer) {
                            scope.activeLayer.olLayer.getSource().un('change', updateGeometryCount);
                        }

                        scope.activeLayer = undefined;
                    };

                    scope.$watch(function () {
                        return DrawService.activeLayer;
                    }, function (newActiveLayer, oldActiveLayer) {
                        if (newActiveLayer === scope.activeLayer) {
                            return;
                        }
                        if (angular.isDefined(oldActiveLayer)) {
                            unbindActiveLayer();
                        }
                        if (angular.isDefined(newActiveLayer)) {
                            bindActiveLayer(newActiveLayer);
                        }
                    });

                    $document.on('keypress', function (e) {
                        if (e.code === 'Delete') {
                            scope.remove();
                        }
                    });

                    scope.getBadgeText = function (count, config) {
                        var text = scope.badgeTexts.current + ': ' + count;
                        if (config.min !== 0) {
                            text += ' ' + scope.badgeTexts.min + ': ' + config.min;
                        }
                        if (config.max !== Infinity) {
                            text += ' ' + scope.badgeTexts.max + ': ' + config.max;
                        }
                        return text;
                    };
                }
            };
        }]);
