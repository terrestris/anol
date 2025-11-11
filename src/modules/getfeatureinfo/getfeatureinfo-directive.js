import './module.js';
import Overlay from 'ol/Overlay';
import WMSGetFeatureInfo from 'ol/format/WMSGetFeatureInfo';
import VectorLayer from 'ol/layer/Vector';
import {unByKey} from 'ol/Observable';

import templateHTML from './templates/getfeatureinfo.html';

angular.module('anol.getfeatureinfo')
    /**
     * @ngdoc directive
     * @name anol.getfeatureinfo.directive:anolGetFeatureInfo
     *
     * @restrict A
     * @requires $http
     * @required $window
     * @requires anol.map.MapService
     * @requires anol.map.LayersService
     * @requires anol.map.ControlsService
     *
     * @description
     * Makes GetFeatureInfo request on all non vector layers with 'featureinfo' property
     * and show result if not empty depending on 'target' specified in 'featureinfo'
     *
     * @param {function} customTargetFilled Callback called after featureinfo result added to custom element
     * @param {string} templateUrl Url to template to use instead of default one
     * @param {function} beforeRequest Callback called before featureinfo requests are fulfilled
     * @param {string} proxyUrl Url for proxy to use for requests.
     *                          When proxyUrl is used, name of requested anol layer
     *                          is appended as path to proxyUrl. E.g.: proxyUrl = '/foo', for layer with name 'bar' requested url is '/foo/bar/',
     *                          also only url params are submitted.
     *
     * Layer property **featureinfo** - {Object} - Contains properties:
     * - **target** - {string} - Target for featureinfo result. ('_blank', '_popup', [element-id])
     */
    .directive('anolGetFeatureInfo', [
        '$rootScope', '$templateRequest', '$http', '$window', '$q', '$compile', 'MapService', 'LayersService', 'ControlsService', 'CatalogService',
        function ($rootScope, $templateRequest, $http, $window, $q, $compile, MapService, LayersService, ControlsService, CatalogService) {
            return {
                restrict: 'A',
                scope: {
                    customTargetFilled: '&',
                    beforeRequest: '&',
                    proxyUrl: '@',
                    popupOpeningDirection: '@',
                    waitingMarkerSrc: '@?',
                    waitingMarkerOffset: '=?',
                    excludeLayers: '=?'
                },
                template: function (tElement, tAttrs) {
                    if (tAttrs.templateUrl) {
                        return '<div></div>';
                    }
                    return templateHTML;
                },
                link: {
                    pre: function (scope, element, attrs) {
                        if (attrs.templateUrl && attrs.templateUrl !== '') {
                            $templateRequest(attrs.templateUrl).then(function (html) {
                                const template = angular.element(html);
                                element.html(template);
                                $compile(template)(scope);
                            });
                        }
                        scope.popupOpeningDirection = scope.popupOpeningDirection || 'top';

                        scope.map = MapService.getMap();
                        // get callback from wrapper function
                        scope.customTargetCallback = scope.customTargetFilled();
                        scope.beforeRequest = scope.beforeRequest();

                        scope.addGroupToMap = async function (groupName) {
                            await CatalogService.addGroupToMap(groupName, true);
                            $rootScope.$digest();
                        };

                        scope.addLayerToMap = async function (layerName) {
                            await CatalogService.addToMap(layerName, true);
                            $rootScope.$digest();
                        };

                        if (angular.isDefined(scope.waitingMarkerSrc)) {
                            scope.waitingOverlayElement = element.find('#get-featureinfo-waiting-overlay');
                            $compile(scope.waitingOverlayElement)(scope);
                            scope.waitingOverlay = new Overlay({
                                element: scope.waitingOverlayElement[0],
                                position: undefined,
                                offset: scope.waitingMarkerOffset
                            });
                            scope.map.addOverlay(scope.waitingOverlay);
                        }
                        const view = scope.map.getView();

                        if (angular.isDefined(scope.proxyUrl)) {
                            if (scope.proxyUrl[scope.proxyUrl.length - 1] !== '/') {
                                scope.proxyUrl += '/';
                            }
                        }

                        const featureInfoLayer = new anol.layer.Feature({
                            name: 'featureInfoLayer',
                            displayInLayerswitcher: false,
                            style: scope.markerStyle
                        });
                        const markerOlLayerOptions = featureInfoLayer.olLayerOptions;
                        markerOlLayerOptions.source = new featureInfoLayer.OL_SOURCE_CLASS(featureInfoLayer.olSourceOptions);
                        markerOlLayerOptions.zIndex = 2001;
                        featureInfoLayer.setOlLayer(new featureInfoLayer.OL_LAYER_CLASS(markerOlLayerOptions));

                        LayersService.addSystemLayer(featureInfoLayer, 0);

                        const handleFeatureinfoResponses = function (featureInfoObjects) {
                            let divTargetCleared = false;
                            let popupCoordinate;
                            angular.forEach(featureInfoObjects, function (featureInfoObject) {
                                if (angular.isUndefined(featureInfoObject)) {
                                    return;
                                }
                                let iframe;
                                if (featureInfoObject.target === '_popup') {
                                    iframe = $('<iframe seamless src="' + featureInfoObject.url + '"></iframe>');
                                }
                                switch (featureInfoObject.target) {
                                    case '_blank':
                                        $window.open(featureInfoObject.url, '_blank');
                                        break;
                                    case '_popup':
                                        // check if reponse is empty e.g. on arc gis gfi
                                        if (featureInfoObject.response.includes("<body></body>")) {
                                            return;
                                        }
                                        iframe.css('width', featureInfoObject.width || 300);
                                        iframe.css('height', featureInfoObject.height || 150);
                                        scope.popupContentTemp.append(iframe);
                                        popupCoordinate = featureInfoObject.coordinate;
                                        break;
                                    default:
                                        const temp = $('<div></div>');
                                        const target = angular.element(featureInfoObject.target);
                                        if (divTargetCleared === false) {
                                            target.empty();
                                            divTargetCleared = true;
                                        }
                                        const content = angular.element(featureInfoObject.response);
                                        temp.append(content);
                                        temp.find('meta').remove();
                                        temp.find('link').remove();
                                        temp.find('title').remove();
                                        temp.find('script').remove();
                                        target.append(temp.children());
                                        if (angular.isFunction(scope.customTargetCallback)) {
                                            scope.customTargetCallback();
                                        }
                                        break;
                                }
                            });

                            scope.hideWaitingOverlay();
                            scope.coordinate = popupCoordinate;
                            return {
                                'coordinate': popupCoordinate,
                                'content': scope.popupContentTemp.children()
                            }
                        };

                        const handleGMLFeatureinfoResponses = function (responses) {
                            const format = new WMSGetFeatureInfo();
                            const responseLayers = [];
                            let catalog = false;
                            let gmlLayerIdx = 0;
                            // add feature to feature infolayer
                            angular.forEach(responses, function (response, idx) {
                                if (angular.isUndefined(response)) {
                                    return;
                                }
                                if (angular.isUndefined(response.gmlData)) {
                                    return;
                                }
                                const features = format.readFeatures(response.gmlData);
                                if (features.length > 0) {
                                    responseLayers.push({
                                        'title': response.title,
                                        'layers': []
                                    });
                                }
                                angular.forEach(features, function (feature) {
                                    feature.set('style', response.style);
                                    if (response.catalog) {
                                        catalog = true;
                                        if (response.group) {
                                            responseLayers[gmlLayerIdx].layers.push(feature.get('group_name'));
                                        } else {
                                            responseLayers[gmlLayerIdx].layers.push(feature.get('layer'));
                                        }
                                    }
                                });
                                if (features.length > 0) {
                                    gmlLayerIdx++;
                                }
                                featureInfoLayer.addFeatures(features);
                            });

                            if (catalog) {
                                // add layer identifier to popup
                                function createPopUpContent(responseLayers) {
                                    const defer = $q.defer();
                                    let count = 0;
                                    angular.forEach(responseLayers, function (rLayer) {
                                        if (rLayer.layers === undefined || rLayer.layers.length === 0) {
                                            count++;
                                            return;
                                        }

                                        const names = [];
                                        angular.forEach(rLayer.layers, function (lname) {
                                            names.push(lname)
                                        });
                                        CatalogService.loadNamesfromServer(names).then(function (data) {
                                            const title = $('<h4>' + rLayer.title + '</h4>');
                                            scope.popupContentTemp.append(title);

                                            angular.forEach(data.groups, function (group) {
                                                const name = group.name;
                                                const title = group.title;
                                                const element = $('<a ng-click="addGroupToMap(\'' + name + '\')">' + title + '</a><br>');
                                                scope.popupContentTemp.append(element)
                                            });

                                            angular.forEach(data.layers, function (layer) {
                                                const name = layer.name;
                                                const title = layer.title;
                                                const element = $('<a ng-click="addLayerToMap(\'' + name + '\')">' + title + '</a><br>');
                                                scope.popupContentTemp.append(element)
                                            });
                                            count++;
                                            if (responseLayers.length === count) {
                                                defer.resolve(scope.popupContentTemp);
                                            }
                                        });
                                    });
                                    return defer.promise;
                                }

                                return createPopUpContent(responseLayers).then(function () {
                                    scope.hideWaitingOverlay();
                                    scope.coordinate = scope.clickedCoordiante;
                                    $compile(scope.popupContentTemp)(scope);
                                    return {
                                        'coordinate': scope.clickedCoordiante,
                                        'content': scope.popupContentTemp.children()
                                    }
                                });
                            }
                        };

                        const createHtmlRequest = (layer, coordinate, viewResolution, view) => {
                            const requestParams = {
                                'INFO_FORMAT': 'text/html'
                            };
                            if (angular.isDefined(layer.featureinfo.featureCount)) {
                                requestParams.FEATURE_COUNT = layer.featureinfo.featureCount;
                            }

                            let url = layer.getFeatureInfoUrl(
                                coordinate, viewResolution, view.getProjection().getCode(), requestParams
                            );
                            if (angular.isDefined(scope.proxyUrl)) {
                                url = scope.proxyUrl + layer.name + '/?' + url.split('?')[1];
                            }
                            if (!angular.isDefined(url)) {
                                return $q.defer().resolve();
                            }
                            return $http.get(url).then(
                                response => {
                                    if (angular.isString(response.data) && response.data !== '' && response.data.search('^\s*<\?xml') === -1) {
                                        return {
                                            target: layer.featureinfo.target,
                                            width: layer.featureinfo.width,
                                            height: layer.featureinfo.height,
                                            url: url,
                                            response: response.data,
                                            coordinate: coordinate
                                        };
                                    }
                                }
                            );
                        };

                        const createGmlRequest = (layer, coordinate, viewResolution, view) => {
                            const gmlRequestParams = {
                                'INFO_FORMAT': 'application/vnd.ogc.gml'
                            };
                            if (angular.isDefined(layer.featureinfo.featureCount)) {
                                gmlRequestParams.FEATURE_COUNT = layer.featureinfo.featureCount;
                            }

                            let gmlUrl = layer.getFeatureInfoUrl(
                                coordinate, viewResolution, view.getProjection().getCode(), gmlRequestParams
                            );
                            if (angular.isDefined(scope.proxyUrl)) {
                                gmlUrl = scope.proxyUrl + layer.name + '/?' + gmlUrl.split('?')[1];
                            }

                            if (!angular.isDefined(gmlUrl)) {
                                return $q.defer().resolve();
                            }

                            return $http.get(gmlUrl).then(
                                response => ({
                                    style: layer.featureinfo.gmlStyle,
                                    gmlData: response.data,
                                    title: layer.title,
                                    catalog: layer.featureinfo.catalog,
                                    group: layer.featureinfo.gmlGroup
                                })
                            );
                        };

                        scope.handleClick = function (evt) {
                            const viewResolution = view.getResolution();
                            const coordinate = evt.coordinate;
                            scope.clickedCoordiante = coordinate;
                            scope.popupProperties = {
                                coordinate: undefined
                            };
                            featureInfoLayer.clear();
                            scope.popupContentTemp = $('<div></div>');
                            if (angular.isFunction(scope.beforeRequest)) {
                                scope.beforeRequest();
                            }

                            scope.showWaitingOverlay(coordinate);

                            const renderPopupContent = () => {
                                scope.popupProperties = {
                                    'coordinate': scope.coordinate,
                                    'content': scope.popupContentTemp.children()
                                }
                            };

                            const htmlRequestPromises = LayersService.flattedLayers()
                                .filter(layer => {
                                    return layer.getVisible()
                                        && !(layer.olLayer instanceof VectorLayer)
                                        && layer.featureinfo
                                        && layer.featureinfo.catalog !== true;
                                })
                                .map(layer => {
                                    return createHtmlRequest(layer, coordinate, viewResolution, view);
                                });

                            const gmlRequestPromises = LayersService.flattedLayers()
                                .filter(layer => {
                                    return layer.getVisible()
                                        && !(layer.olLayer instanceof VectorLayer)
                                        && layer.featureinfo
                                        && layer.featureinfo.gml === true
                                })
                                .map(layer => {
                                    return createGmlRequest(layer, coordinate, viewResolution, view);
                                });

                            $q.all(htmlRequestPromises)
                                .then(handleFeatureinfoResponses)
                                .then(() => $q.all(gmlRequestPromises))
                                .then(handleGMLFeatureinfoResponses)
                                .then(() => {
                                    renderPopupContent();
                                });
                        };

                        scope.hideWaitingOverlay = function () {
                            if (angular.isDefined(scope.waitingMarkerSrc)) {
                                scope.waitingOverlay.setPosition(undefined);
                            }
                        };

                        scope.showWaitingOverlay = function (coordinate) {
                            if (angular.isDefined(scope.waitingMarkerSrc)) {
                                scope.waitingOverlay.setPosition(coordinate);
                            }
                        };

                        scope.featureInfoPopupClosed = function () {
                            featureInfoLayer.clear();
                        };
                    },
                    post: function (scope) {
                        let handlerKey;
                        const control = new anol.control.Control({
                            subordinate: true,
                            olControl: null
                        });
                        control.onDeactivate(function () {
                            unByKey(handlerKey);
                        });
                        control.onActivate(function () {
                            handlerKey = scope.map.on('singleclick', scope.handleClick, this);
                        });

                        control.activate();

                        ControlsService.addControl(control);
                    }
                }
            };
        }]);
