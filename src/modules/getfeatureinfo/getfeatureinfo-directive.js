import './module.js';
import Overlay from 'ol/Overlay';
import WMSGetFeatureInfo from 'ol/format/WMSGetFeatureInfo';
import VectorLayer from 'ol/layer/Vector';
import { unByKey } from 'ol/Observable';

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
                            When proxyUrl is used, name of requested anol layer
 *                          is appended as path to proxyUrl. E.g.: proxyUrl = '/foo', for layer with name 'bar' requested url is '/foo/bar/'.
 *                          Also only url params are submitted.
 *
 * Layer property **featureinfo** - {Object} - Contains properties:
 * - **target** - {string} - Target for featureinfo result. ('_blank', '_popup', [element-id])
 */
    .directive('anolGetFeatureInfo', [
        '$templateRequest', '$http', '$window', '$q', '$compile', 'MapService', 'LayersService', 'ControlsService', 'CatalogService',
        function($templateRequest, $http, $window, $q, $compile, MapService, LayersService, ControlsService, CatalogService) {
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
                template: function(tElement, tAttrs) {
                    if (tAttrs.templateUrl) {
                        return '<div></div>';
                    }
                    return require('./templates/getfeatureinfo.html');
                },           
                link: {
                    pre: function(scope, element, attrs) {
                        if (attrs.templateUrl && attrs.templateUrl !== '') {
                            $templateRequest(attrs.templateUrl).then(function(html){
                                var template = angular.element(html);
                                element.html(template);
                                $compile(template)(scope);
                            });
                        }                     
                        scope.popupOpeningDirection = scope.popupOpeningDirection || 'top';

                        scope.map = MapService.getMap();
                        // get callback from wrapper function
                        scope.customTargetCallback = scope.customTargetFilled();
                        scope.beforeRequest = scope.beforeRequest();

                        scope.addGroupToMap = function(groupName) {
                            CatalogService.addGroupToMap(groupName, true);
                        };

                        scope.addLayerToMap = function(layerName) {
                            CatalogService.addToMap(layerName, true);
                        };

                        if(angular.isDefined(scope.waitingMarkerSrc)) {
                            scope.waitingOverlayElement = element.find('#get-featureinfo-waiting-overlay');
                            $compile(scope.waitingOverlayElement)(scope);
                            scope.waitingOverlay = new Overlay({
                                element: scope.waitingOverlayElement[0],
                                position: undefined,
                                offset: scope.waitingMarkerOffset
                            });
                            scope.map.addOverlay(scope.waitingOverlay);
                        }
                        var view = scope.map.getView();

                        if(angular.isDefined(scope.proxyUrl)) {
                            if(scope.proxyUrl[scope.proxyUrl.length - 1] !== '/') {
                                scope.proxyUrl += '/';
                            }
                        }

                        var featureInfoLayer = new anol.layer.Feature({
                            name: 'featureInfoLayer',
                            displayInLayerswitcher: false,
                            style: scope.markerStyle
                        });
                        var markerOlLayerOptions = featureInfoLayer.olLayerOptions;
                        markerOlLayerOptions.source = new featureInfoLayer.OL_SOURCE_CLASS(featureInfoLayer.olSourceOptions);
                        markerOlLayerOptions.zIndex = 2001;
                        featureInfoLayer.setOlLayer(new featureInfoLayer.OL_LAYER_CLASS(markerOlLayerOptions));

                        LayersService.addSystemLayer(featureInfoLayer, 0);

                        var handleFeatureinfoResponses = function(featureInfoObjects) {
                            var divTargetCleared = false;
                            var popupCoordinate;
                            angular.forEach(featureInfoObjects, function(featureInfoObject) {
                                if(angular.isUndefined(featureInfoObject)) {
                                    return;
                                }
                                var iframe;
                                if(featureInfoObject.target === '_popup') {
                                    iframe = $('<iframe seamless id="feature_info_iframe" src="' + featureInfoObject.url + '"></iframe>');
                                }
                                switch(featureInfoObject.target) {
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
                                        var temp = $('<div></div>');
                                        var target = angular.element(featureInfoObject.target);
                                        if(divTargetCleared === false) {
                                            target.empty();
                                            divTargetCleared = true;
                                        }
                                        var content = angular.element(featureInfoObject.response);
                                        temp.append(content);
                                        temp.find('meta').remove();
                                        temp.find('link').remove();
                                        temp.find('title').remove();
                                        temp.find('script').remove();
                                        target.append(temp.children());
                                        if(angular.isFunction(scope.customTargetCallback)) {
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

                        var handleGMLFeatureinfoResponses = function(responses) {
                            var format = new WMSGetFeatureInfo();
                            var responseLayers = [];
                            var catalog = false;
                            var gmlLayerIdx = 0;
                            // add feature to feature infolayer
                            angular.forEach(responses, function(response, idx) {
                                if(angular.isUndefined(response)) {
                                    return;
                                }
                                if(angular.isUndefined(response.gmlData)) {
                                    return;
                                }
                                var features = format.readFeatures(response.gmlData);
                                if (features.length > 0) {
                                    responseLayers.push({
                                        'title': response.title,
                                        'layers': []
                                    });
                                }
                                angular.forEach(features, function(feature) {
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
                                    var defer = $q.defer();
                                    var count = 0;
                                    angular.forEach(responseLayers, function(rLayer) {
                                        if (rLayer.layers === undefined || rLayer.layers.length === 0) {
                                            return;
                                        }
                                        
                                        var names = [];
                                        angular.forEach(rLayer.layers, function(lname) {
                                            names.push(lname)
                                        });
                                        CatalogService.loadNamesfromServer(names).then(function(data){
                                            var title = $('<h4>'+ rLayer.title +'</h4>');
                                            scope.popupContentTemp.append(title);

                                            angular.forEach(data.groups, function(group) {
                                                var name = group.name
                                                var title = group.title;
                                                var element = $('<a ng-click="addGroupToMap(\''+name +'\')">'+ title +'</a><br>');
                                                scope.popupContentTemp.append(element)
                                            });
                                    
                                            angular.forEach(data.layers, function(layer) {
                                                var name = layer.name
                                                var title = layer.title;
                                                var element = $('<a ng-click="addLayerToMap(\''+name +'\')">'+ title +'</a><br>');
                                                scope.popupContentTemp.append(element)
                                            });
                                            count++;
                                            if (responseLayers.length == count) {
                                                defer.resolve(scope.popupContentTemp); 
                                            }
                                        });
                                    });
                                    return defer.promise;
                                } 
                                var data = createPopUpContent(responseLayers).then(function() {
                                    scope.hideWaitingOverlay();
                                    scope.coordinate = scope.clickedCoordiante;
                                    $compile(scope.popupContentTemp)(scope);
                                    return {
                                        'coordinate': scope.clickedCoordiante,
                                        'content': scope.popupContentTemp.children()
                                    }
                                });
                                return data;
                            }
                        };


                        scope.handleClick = function(evt) {
                            var viewResolution = view.getResolution();
                            var coordinate = evt.coordinate;
                            scope.clickedCoordiante = coordinate;
                            scope.popupProperties = {
                                coordinate: undefined
                            };
                            featureInfoLayer.clear();
                            scope.popupContentTemp = $('<div></div>');
                            if(angular.isFunction(scope.beforeRequest)) {
                                scope.beforeRequest();
                            }

                            scope.showWaitingOverlay(coordinate);

                            var requestPromises = [];
                            // this is resolved after all requests started
                            var requestsDeferred = $q.defer();
                            requestsDeferred.promise.then(function() {
                                // promises added before requests started
                                // all promises will be resolved, otherwise we can't access the data
                                // promises that should be rejected will be resolved with undefined
                                $q.all(requestPromises).then(handleFeatureinfoResponses);
                            });

                            var gmlRequestPromises = [];
                            var gmlRequestsDeferred = $q.defer();
                            gmlRequestsDeferred.promise.then(function() {
                                var content = $q.all(requestPromises.concat(gmlRequestPromises)).then(handleGMLFeatureinfoResponses);
                                content.then(function(data) {
                                    renderPopupContent();
                                })
                            });

                            function renderPopupContent() {
                                scope.popupProperties = {
                                    'coordinate': scope.coordinate,
                                    'content': scope.popupContentTemp.children()
                                }
                            };

                            angular.forEach(LayersService.flattedLayers(), function(layer) {
                                if(!layer.getVisible()) {
                                    return;
                                }
                                if(layer.olLayer instanceof VectorLayer) {
                                    return;
                                }
                                if(!layer.featureinfo) {
                                    return;
                                }

                                if(layer.featureinfo.catalog !== true) {
                                    var requestParams ={
                                        'INFO_FORMAT': 'text/html'
                                    };
                                    if(angular.isDefined(layer.featureinfo.featureCount)) {
                                        requestParams.FEATURE_COUNT = layer.featureinfo.featureCount;
                                    }

                                    var url = layer.getFeatureInfoUrl(
                                        coordinate, viewResolution, view.getProjection().getCode(), requestParams
                                    );
                                    if(angular.isDefined(scope.proxyUrl)) {
                                        url = scope.proxyUrl + layer.name + '/?' + url.split('?')[1];
                                    }
                                    if(angular.isDefined(url)) {
                                        var requestDeferred = $q.defer();
                                        requestPromises.push(requestDeferred.promise);
                                        $http.get(url).then(
                                            function(response) {
                                                if(angular.isString(response.data) && response.data !== '' && response.data.search('^\s*<\?xml') === -1) {
                                                    requestDeferred.resolve({
                                                        target: layer.featureinfo.target,
                                                        width: layer.featureinfo.width,
                                                        height: layer.featureinfo.height,
                                                        url: url,
                                                        response: response.data,
                                                        coordinate: coordinate
                                                    });
                                                } else {
                                                    requestDeferred.resolve();
                                                }
                                            },
                                            function() {
                                                requestDeferred.resolve();
                                            }
                                        );
                                    }
                                }

                                if(layer.featureinfo.gml !== true) {
                                    return;
                                }
                                var gmlRequestParams = {
                                    'INFO_FORMAT': 'application/vnd.ogc.gml'
                                };
                                if(angular.isDefined(layer.featureinfo.featureCount)) {
                                    gmlRequestParams.FEATURE_COUNT = layer.featureinfo.featureCount;
                                }

                                var gmlUrl = layer.getFeatureInfoUrl(
                                    coordinate, viewResolution, view.getProjection().getCode(), gmlRequestParams
                                );
                                if(angular.isDefined(scope.proxyUrl)) {
                                    gmlUrl = scope.proxyUrl + layer.name + '/?' + gmlUrl.split('?')[1];
                                }

                                if(angular.isDefined(gmlUrl)) {
                                    var gmlRequestDeferred = $q.defer();
                                    gmlRequestPromises.push(gmlRequestDeferred.promise);
                                    $http.get(gmlUrl).then(
                                        function(response) {
                                            gmlRequestDeferred.resolve({
                                                style: layer.featureinfo.gmlStyle, 
                                                gmlData: response.data, 
                                                title: layer.title, 
                                                catalog: layer.featureinfo.catalog,
                                                group: layer.featureinfo.gmlGroup
                                            });
                                        },
                                        function() {
                                            gmlRequestDeferred.resolve();
                                        }
                                    );
                                }
                            });
                            requestsDeferred.resolve();
                            gmlRequestsDeferred.resolve();
                        };

                        scope.hideWaitingOverlay = function() {
                            if(angular.isDefined(scope.waitingMarkerSrc)) {
                                scope.waitingOverlay.setPosition(undefined);
                            }
                        };

                        scope.showWaitingOverlay = function(coordinate) {
                            if(angular.isDefined(scope.waitingMarkerSrc)) {
                                scope.waitingOverlay.setPosition(coordinate);
                            }
                        };

                        scope.featureInfoPopupClosed = function() {
                            featureInfoLayer.clear();
                        };
                    },
                    post: function(scope) {
                        var handlerKey;
                        var control = new anol.control.Control({
                            subordinate: true,
                            olControl: null
                        });
                        control.onDeactivate(function() {
                            unByKey(handlerKey);
                        });
                        control.onActivate(function() {
                            handlerKey = scope.map.on('singleclick', scope.handleClick, this);
                        });

                        control.activate();

                        ControlsService.addControl(control);
                    }
                }
            };
        }]);
