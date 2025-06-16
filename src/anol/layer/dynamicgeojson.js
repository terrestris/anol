/**
 * @ngdoc object
 * @name anol.layer.DynamicGeoJSON
 *
 * @param {Object} options AnOl Layer options
 * @param {Object} options.olLayer Options for ol.layer.Vector
 * @param {Object} options.olLayer.source Options for ol.source.Vector
 * @param {string} options.olLayer.source.url Url for requesting a GeoJSON
 * @param {string} options.olLayer.source.featureProjection Projection of received GeoJSON
 * @param {Object} options.olLayer.source.additionalParameters Additional parameters added to request
 *
 * @description
 * Inherits from {@link anol.layer.Layer anol.layer.StaticGeoJSON}.
 *
 * @notice
 * Every feature in response must have a '__layer__' property containing the layername given to this layer.
 * Otherwise features will not be styled.
 *
 * Ask *url* with current projection and bbox.
 */

import StaticGeoJSON from './staticgeojson.js';

import {bbox as bboxStrategy} from 'ol/loadingstrategy';
import Style from 'ol/style/Style';
import Text from 'ol/style/Text';
import Stroke from 'ol/style/Stroke';
import {containsCoordinate} from 'ol/extent';

import GeoJSON from 'ol/format/GeoJSON';
import AnolBaseLayer from "../layer";

class DynamicGeoJSON extends StaticGeoJSON {

    constructor(_options) {
        super(_options);
        if(
            angular.isObject(_options) &&
            angular.isObject(_options.olLayer) &&
            angular.isObject(_options.olLayer.source)
        ) {
            this.additionalRequestParameters = _options.olLayer.source.additionalParameters;
        }
        this.CLASS_NAME = 'anol.layer.DynamicGeoJSON';

        this.olSourceOptions = this._createSourceOptions(_options.olLayer.source);
        delete _options.olLayer.source;
        this.olLayerOptions = _options.olLayer;
        this.olLayer = undefined;
        this.visible = this.olLayerOptions.visible !== false;
    }

    setOlLayer(olLayer) {
        super.setOlLayer(olLayer);
        this.olSource = this.isClustered() ? this.unclusteredSource : olLayer.getSource();
    }

    isCombinable(other) {
        return AnolBaseLayer.prototype.isCombinable.call(this, other) &&
            this.olSourceOptions.url === other.olSourceOptions.url &&
            this.olSourceOptions.featureProjection === other.olSourceOptions.featureProjection &&
            (this.clusterOptions === false || this.anolGroup === other.anolGroup);
    }

    getCombinedLayer(other) {
        this.olSource.get('anolLayers').push(other);
        this.olLayer.get('anolLayers').push(other);

        other.setOlLayer(this.olLayer);

        return this.olLayer;
    }

    getVisible() {
        if (this.combined) {
            return this.visible;
        }
        return super.getVisible();
    }

    setVisible(visible) {
        this.visible = visible;
        if (this.combined) {
            super.setVisible(this.olLayer.get('anolLayers').some(l => l.getVisible()));
        } else {
            super.setVisible(visible);
        }
        this.olSource.refresh();
    }

    /**
     * Additional source options
     * - url
     * - featureProjection
     * - additionalParameters
     */
    _createSourceOptions(srcOptions) {
        var self = this;
        srcOptions.format = new GeoJSON();
        srcOptions.strategy = bboxStrategy;

        srcOptions.loader = function(extent, resolution, projection) {
            const additionalParameters = this.olLayer.get('anolLayers')
                .filter(l => l.getVisible())
                .reduce((params, layer) =>
                    anol.helper.mergeObjects({ ...params }, layer.additionalRequestParameters),
                    {}
                );

            self.loader(
                srcOptions.url,
                extent,
                resolution,
                projection,
                srcOptions.featureProjection,
                additionalParameters
            );
        };

        return super._createSourceOptions(srcOptions);
    }

    loader(url, extent, resolution, projection, featureProjection, additionalParameters) {
        var self = this;
        var params = [
            'srs=' + projection.getCode(),
            'bbox=' + extent.join(','),
            'resolution=' + resolution,
            'zoom='+self.map.getView().getZoom()
        ];
        if($.isFunction(additionalParameters)) {
            params.push(additionalParameters());
        } else if(angular.isObject(additionalParameters)) {
            angular.forEach(additionalParameters, function(value, key) {
                params.push(key + '=' + value);
            });
        }

        $.ajax({
            url: url + params.join('&'),
            dataType: 'json'
        }).done(function(response) {
            self.responseHandler(response, featureProjection);
        });
    }

    responseHandler(response, featureProjection) {
        var self = this;
        self.olSource.clear();
        var format = new GeoJSON();
        var features = format.readFeatures(response, {
            featureProjection: featureProjection
        });
        self.olSource.addFeatures(features);
    }

    createStyle(feature, resolution) {
        // call parent func when feature is undefined
        if(angular.isUndefined(feature)) {
            return super.createStyle(feature, resolution);
        }

        var features = feature.get('features');

        // normal feature
        if(angular.isUndefined(features)) {
            // return empty style if feature not belongs to this layer
            if(feature.get('__layer__') !== this.name) {
                return new Style();
            } else {
                return super.createStyle(feature, resolution);
            }
        }

        // cluster with one feature
        if(features.length === 1) {
            if(features[0].get('__layer__') === this.name) {
                return super.createStyle(features[0], resolution);
            } else {
                return new Style();
            }
        }

        var sourceLayers = this.olSource.get('anolLayers');
        var styleLayer;
        for(var i = 0; i < sourceLayers.length; i++) {
            if(sourceLayers[i].getVisible()) {
                styleLayer = sourceLayers[i];
                break;
            }
        }

        if(angular.isDefined(styleLayer) && styleLayer !== this) {
            return new Style();
        }

        // cluster with more than one feature
        return super.createStyle(feature, resolution);
    }

    createClusterStyle(clusterFeature) {
        var visible = containsCoordinate(
            this.map.getView().calculateExtent(this.map.getSize()),
            clusterFeature.getGeometry().getCoordinates()
        );
        if(!visible) {
            return new Style();
        }
        var cachedStyle = clusterFeature.get('cachedStyle');
        if(cachedStyle !== null && angular.isDefined(cachedStyle)) {
            return cachedStyle;
        }
        var self = this;
        var legendItems = {};
        var objCount = 0;
        var layers = this.olLayer.getSource().get('anolLayers');
        // iterate over revealed features and sort/count by layer
        clusterFeature.get('features').forEach(function(feature) {
            layers.forEach(function(layer) {
                if(layer.unclusteredSource.getFeatures().indexOf(feature) > -1) {
                    if(layer.name === feature.get('__layer__')) {
                        if(angular.isUndefined(legendItems[layer.name])) {
                            legendItems[layer.name] = {
                                layer: layer,
                                count: 0
                            };
                            objCount ++;
                        }
                        legendItems[layer.name].count ++;
                    }
                }

            });
        });

        var styles = [];

        var even = objCount % 2 === 0;
        var i = 0;
        var lastXAnchor = 0;
        angular.forEach(legendItems, function(value) {
            var defaultStyle = value.layer.olLayer.getStyle();
            if(angular.isFunction(defaultStyle)) {
                defaultStyle = defaultStyle()[0];
            }
            var styleDefinition = angular.extend({}, value.layer.style);
            if(objCount > 1) {
                if(i % 2 === 0) {
                    styleDefinition.graphicXAnchor = lastXAnchor + i;
                } else {
                    styleDefinition.graphicXAnchor = lastXAnchor - i;
                }

                lastXAnchor = styleDefinition.graphicXAnchor;

                styleDefinition.graphicXAnchor += even ? 1.0 : 0.5;
                styleDefinition.graphicXAnchor *= styleDefinition.graphicWidth;
                styles.push(
                    new Style({
                        image: self.createIconStyle(styleDefinition, defaultStyle.getImage()),
                        text: new Text({
                            text: value.count.toString(),
                            offsetX: (styleDefinition.graphicXAnchor - styleDefinition.graphicWidth / 2) * -1,
                            offsetY: styleDefinition.graphicHeight,
                            stroke: new Stroke({color: '#fff', width: 2})
                        })
                    })
                );
            } else {
                styles.push(defaultStyle);
                if (angular.isUndefined(styleDefinition.fontOffsetY)) {
                    styleDefinition.fontOffsetY = value.layer.style.graphicHeight;
                }
                styles.push(new Style({
                    text: self.createTextStyle(
                        styleDefinition,
                        null,
                        undefined,
                        value.count.toString()
                    )
                }));
            }
            i++;
        });
        clusterFeature.set('cachedStyle', styles);
        return styles;

    }
    refresh() {
        this._refresh();
    }
}

export default DynamicGeoJSON;

