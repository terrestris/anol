import './module.js';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import Select from 'ol/interaction/Select';
import Geolocation from 'ol/Geolocation';

import templateHTML from './templates/geolocation.html';
import {containsCoordinate} from 'ol/extent';

angular.module('anol.geolocation')
    /**
     * @ngdoc directive
     * @name anol.geolocation.directive:anolGeolocation
     *
     * @restrict A
     * @requires $compile
     * @requires anol.map.MapService
     * @requires anol.map.ControlsService
     *
     * @param {boolean} anolGeolocation When true, geolocation is startet just after map init
     * @param {boolean} disableButton When true, no geolocate button is added
     * @param {number} zoom Zoom level after map centered on geolocated point
     * @param {string} tooltipPlacement Position of tooltip
     * @param {number} tooltipDelay Time in milisecounds to wait before display tooltip
     * @param {boolean} tooltipEnable Enable tooltips. Default true for non-touch screens, default false for touchscreens
     * @param {string} templateUrl Url to template to use instead of default one
     *
     * @description
     * Get current position and center map on it.
     */
    .directive('anolGeolocation', ['$templateRequest', '$compile', '$translate', '$timeout', 'MapService', 'ControlsService', 'LayersService', 'InteractionsService',
        function ($templateRequest, $compile, $translate, $timeout, MapService, ControlsService, LayersService, InteractionsService) {
            return {
                scope: {
                    anolGeolocation: '@',
                    disableButton: '@',
                    zoom: '@',
                    tooltipPlacement: '@',
                    tooltipDelay: '@',
                    tooltipEnable: '@',
                    showPosition: '@',
                    highlight: '@',
                    resultStyle: '=?'
                },
                template: function (tElement, tAttrs) {
                    if (tAttrs.templateUrl) {
                        return '<div></div>';
                    }
                    return templateHTML;
                },
                link: function (scope, element, attrs) {
                    let geolocationLayer;
                    if (attrs.templateUrl && attrs.templateUrl !== '') {
                        $templateRequest(attrs.templateUrl).then(function (html) {
                            const template = angular.element(html);
                            element.html(template);
                            $compile(template)(scope);
                        });
                    }
                    scope.anolGeolocation = 'false' !== scope.anolGeolocation;
                    scope.showPosition = 'false' !== scope.showPosition;
                    scope.highlight = angular.isDefined(scope.highlight) ? parseInt(scope.highlight) : false;

                    // attribute defaults
                    scope.tooltipPlacement = angular.isDefined(scope.tooltipPlacement) ?
                        scope.tooltipPlacement : 'right';
                    scope.tooltipDelay = angular.isDefined(scope.tooltipDelay) ?
                        scope.tooltipDelay : 500;
                    scope.tooltipEnable = angular.isDefined(scope.tooltipEnable) ?
                        scope.tooltipEnable : !('ontouchstart' in window);
                    if (scope.showPosition) {
                        geolocationLayer = new anol.layer.Feature({
                            name: 'geolocationLayer',
                            displayInLayerswitcher: false,
                            style: scope.resultStyle
                        })
                        const geolocationOlLayerOptions = geolocationLayer.olLayerOptions;
                        geolocationOlLayerOptions.source = new geolocationLayer.OL_SOURCE_CLASS(geolocationLayer.olSourceOptions);
                        geolocationLayer.setOlLayer(new geolocationLayer.OL_LAYER_CLASS(geolocationOlLayerOptions));

                        LayersService.addSystemLayer(geolocationLayer);
                    }

                    if ('true' !== scope.disableButton) {
                        const button = $('');
                        element.addClass('anol-geolocation');
                        element.append($compile(button)(scope));
                    }

                    const changeCursorCondition = function (pixel) {
                        return MapService.getMap().hasFeatureAtPixel(pixel, {
                            layerFilter: function (layer) {
                                return geolocationLayer === layer.get('anolLayer');
                            }
                        });
                    };

                    const addGeolocationFeatures = function (accuracyGeometry, position) {
                        const features = [];
                        if (angular.isDefined(accuracyGeometry) && accuracyGeometry !== null) {
                            features.push(new Feature({
                                geometry: accuracyGeometry
                            }));
                        }
                        if (angular.isDefined(position) && position !== null) {
                            features.push(new Feature({
                                geometry: new Point(position)
                            }));
                        }
                        if (features.length > 0) {
                            geolocationLayer.addFeatures(features);

                            if (scope.highlight > 0) {
                                $timeout(function () {
                                    geolocationLayer.clear();
                                }, scope.highlight);
                            } else {
                                let removeGeolocationFeaturesInteraction = new Select({
                                    layers: [geolocationLayer.olLayer]
                                });
                                removeGeolocationFeaturesInteraction.on('select', function (evt) {
                                    if (evt.selected.length > 0) {
                                        removeGeolocationFeaturesInteraction.getFeatures().clear();
                                        geolocationLayer.clear();
                                        InteractionsService.removeInteraction(removeGeolocationFeaturesInteraction);
                                        MapService.removeCursorPointerCondition(changeCursorCondition);
                                        removeGeolocationFeaturesInteraction = undefined;
                                    }
                                });
                                InteractionsService.addInteraction(removeGeolocationFeaturesInteraction);
                                MapService.addCursorPointerCondition(changeCursorCondition);
                            }
                        }
                    };

                    const view = MapService.getMap().getView();
                    const geolocation = new Geolocation({
                        projection: view.getProjection().getCode(),
                        tracking: scope.anolGeolocation,
                        trackingOptions: {
                            enableHighAccuracy: true,
                            maximumAge: 0
                        }
                    });

                    geolocation.on('change:accuracyGeometry', function () {
                        geolocation.setTracking(false);
                        const position = geolocation.getPosition();
                        const accuracyGeometry = geolocation.getAccuracyGeometry();
                        const extent = view.calculateExtent();
                        if (!containsCoordinate(extent, position)) {
                            $translate('anol.geolocation.POSITION_OUT_OF_MAX_EXTENT').then(function (translation) {
                                scope.$emit('anol.geolocation', {'message': translation, 'type': 'error'});
                            });
                            return;
                        }
                        if (scope.showPosition) {
                            addGeolocationFeatures(accuracyGeometry, position);
                        }
                        view.setCenter(position);
                        view.fit(accuracyGeometry.getExtent(), MapService.getMap().getSize());
                        if (angular.isDefined(scope.zoom) && parseInt(scope.zoom) < view.getZoom()) {
                            view.setZoom(parseInt(scope.zoom));
                        }
                    });

                    scope.locate = function () {
                        if (scope.showPosition) {
                            geolocationLayer.clear();
                        }
                        geolocation.setTracking(true);
                    };

                    element.addClass('ol-control');

                    ControlsService.addControl(new anol.control.Control({
                        element: element
                    }));
                }
            };
        }]);
