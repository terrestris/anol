import './module.js';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import {fromExtent} from 'ol/geom/Polygon';
import {getObjectParam, stringifyObject} from "./util";

angular.module('anol.urlmarkers')
    /**
     * @ngdoc object
     * @name anol.urlmarkers.UrlMarkersServiceProvider
     */
    .provider('UrlMarkersService', [function () {
        var _defaultSrs;
        var _propertiesDelimiter = '|';
        var _keyValueDelimiter = ':';
        var _style = {};
        var _usePopup = true;
        var _popupOffset = [0, 0];

        /**
         * @ngdoc method
         * @name setDefaultSrs
         * @methodOf anol.urlmarkers.UrlMarkersServiceProvider
         * @param {string} srs default EPSG code of marker coordinates in url
         */
        this.setDefaultSrs = function (srs) {
            _defaultSrs = srs;
        };

        /**
         * @ngdoc method
         * @name setPropertiesDelimiter
         * @methodOf anol.urlmarkers.UrlMarkersServiceProvider
         * @param {string} delimiter Delimiter separating marker properties
         */
        this.setPropertiesDelimiter = function (delimiter) {
            _propertiesDelimiter = delimiter || _propertiesDelimiter;
        };

        /**
         * @ngdoc method
         * @name setKeyValueDelimiter
         * @methodOf anol.urlmarkers.UrlMarkersServiceProvider
         * @param {string} delimiter Delimiter separating properties keys from values
         */
        this.setKeyValueDelimiter = function (delimiter) {
            _keyValueDelimiter = delimiter || _keyValueDelimiter;
        };

        /**
         * @ngdoc method
         * @name setMarkerStyle
         * @methodOf anol.urlmarkers.UrlMarkersServiceProvider
         * @param {object} style marker style
         */
        this.setMarkerStyle = function (style) {
            _style = style;
        };

        /**
         * @ngdoc method
         * @name setPopup
         * @methodOf anol.urlmarkers.UrlMarkersServiceProvider
         * @param {boolean} usePopup
         * @description When not using popup a label text is added. This can be styled by markerStyle
         */
        this.setUsePopup = function (usePopup) {
            _usePopup = angular.isUndefined(usePopup) ? _usePopup : usePopup;
        };

        /**
         * @ngdoc method
         * @name setPopupOffset
         * @methodOf anol.urlmarkers.UrlMarkersServiceProvider
         * @param {Array.<number>} popupOffset Offset of placed popup. First value is x- second value is y-offset in px
         */
        this.setPopupOffset = function (popupOffset) {
            _popupOffset = angular.isUndefined(popupOffset) ? _popupOffset : popupOffset;
        };

        this.$get = ['$location', 'MapService', 'LayersService', function ($location, MapService, LayersService) {
            /**
             * @ngdoc service
             * @name anol.urlmarkers.UrlMarkersService
             *
             * @description
             * Adds markers specified in url. A valid url marker looks like marker=color:ff0000|label:foobar|coord:8.21,53.15|srs:4326
             */
            class UrlMarkerService {
                constructor(defaultSrs, propertiesDelimiter, keyValueDelimiter, style, usePopup, popupOffset) {
                    var self = this;
                    self.defaultSrs = defaultSrs || MapService.view.getProjection();
                    self.propertiesDelimiter = propertiesDelimiter;
                    self.keyValueDelimiter = keyValueDelimiter;
                    self.style = style;
                    self.usePopup = usePopup;
                    self.popupOffset = popupOffset;

                    self.layer = self.createLayer();

                    self.extractFeaturesFromUrl();

                    LayersService.addSystemLayer(self.layer);
                }

                extractFeaturesFromUrl() {
                    var self = this;
                    var urlParams = $location.search();
                    if (angular.isUndefined(urlParams.marker)) {
                        return false;
                    }

                    const markers = getObjectParam('marker', urlParams, true);

                    for (const marker of markers) {
                        let geometry;
                        let isBbox;
                        if (marker.coord) {
                            const coords = marker.coord.split(',').map(parseFloat);
                            geometry = new Point(coords);
                            isBbox = false;
                        } else if (marker.bbox) {
                            const extent = marker.bbox.split(',').map(parseFloat);
                            geometry = fromExtent(extent);
                            isBbox = true;
                        } else {
                            console.error('Url Marker is missing geometry (bbox or coord)');
                            continue;
                        }

                        let srs = self.defaultSrs;

                        if (marker.srs) {
                            srs = `EPSG:${marker.srs}`;
                        }

                        geometry = geometry.transform(
                            srs,
                            MapService.getMap().getView().getProjection().getCode()
                        );

                        self.createMarker({
                            geometry,
                            color: marker.color,
                            label: marker.label,
                            srs: marker.srs,
                            isBbox,
                            fit: marker.fit
                        });
                    }

                    this.updateUrl();
                }

                updateUrl() {
                    const mapProjection = MapService.getMap().getView().getProjection().getCode();
                    const markers = this.layer.olLayer.getSource().getFeatures().map(f => {
                        const params = {};

                        let srs = this.defaultSrs;
                        if (angular.isDefined(f.get('srs'))) {
                            srs = `EPSG:${f.get('srs')}`;
                            params.srs = f.get('srs');
                        }

                        const geometry = f.getGeometry().transform(
                            mapProjection,
                            srs
                        );

                        if (f.get('isBbox')) {
                            params.bbox = geometry.getExtent().join(',')
                        } else {
                            params.coord = geometry.getFirstCoordinate().join(',')
                        }
                        if (angular.isDefined(f.get('label'))) {
                            params.label = f.get('label');
                        }
                        if (angular.isDefined(f.get('color'))) {
                            params.label = f.get('color');
                        }
                        return stringifyObject(params);
                    });

                    const search = angular.copy($location.search())
                    search.marker = markers;

                    $location.search(search);
                    $location.replace();
                }

                createMarker({geometry, color, label, fit, isBbox}) {
                    let style = {};
                    if (angular.isDefined(color)) {
                        style = {
                            fillColor: '#' + color,
                            strokeColor: '#' + color,
                            graphicColor: '#' + color
                        };
                    }

                    const options = {
                        geometry,
                        label,
                        color,
                        isBbox,
                        style: angular.merge({}, this.style, style)
                    };

                    if (!this.usePopup && angular.isDefined(label)) {
                        options.style.text = label;
                    }
                    this.layer.olLayer.getSource().addFeature(new Feature(options));
                    if (fit) {
                        const map = MapService.getMap();
                        map.once('postrender', () => {
                            map.getView().fit(geometry);
                            this.updateUrl();
                        });
                    }
                }

                createLayer() {
                    var layer = new anol.layer.Feature({
                        name: 'markersLayer',
                        olLayer: {
                            zIndex: 2001,
                            source: {
                                features: []
                            }
                        }
                    });

                    var olLayerOptions = layer.olLayerOptions;
                    olLayerOptions.source = new layer.OL_SOURCE_CLASS(layer.olSourceOptions);
                    layer.setOlLayer(new layer.OL_LAYER_CLASS(olLayerOptions));

                    return layer;
                }
            }

            return new UrlMarkerService(_defaultSrs, _propertiesDelimiter, _keyValueDelimiter, _style, _usePopup, _popupOffset);
        }];
    }]);
