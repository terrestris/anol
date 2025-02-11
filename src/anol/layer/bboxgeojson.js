/**
 * @ngdoc object
 * @name anol.layer.BBOXGeoJSON
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
import GeoJSON from 'ol/format/GeoJSON';
import {bbox as bboxStrategy} from 'ol/loadingstrategy';

import {transformExtent} from 'ol/proj.js';

class BBOXGeoJSON  extends StaticGeoJSON {

    constructor(_options) {
        super(_options);
        if(
            angular.isObject(_options) &&
            angular.isObject(_options.olLayer) &&
            angular.isObject(_options.olLayer.source)
        ) {
            this.additionalRequestParameters = _options.olLayer.source.additionalParameters;
        }
        this.CLASS_NAME = 'anol.layer.BBOXGeoJSON';

    }

    setOlLayer(olLayer) {
        super.setOlLayer(olLayer);
        this.olSource = this.olLayer.getSource();
    }
    /**
     * Additional source options
     * - url
     * - featureProjection
     * - additionalParameters
     */
    _createSourceOptions(srcOptions) {
        var self = this;
        srcOptions.format = new GeoJSON(
            {
                dataProjection: srcOptions.dataProjection
            }
        );
        srcOptions.strategy = bboxStrategy;
        srcOptions.loader = function(extent, resolution, projection) {
            var additionalParameters = {};
            angular.forEach(self.olSource.get('anolLayers'), function(layer) {
                if(layer.getVisible()) {
                    additionalParameters = anol.helper.mergeObjects(additionalParameters, layer.additionalRequestParameters);
                }
            });
            self.loader(
                srcOptions.url,
                extent,
                resolution,
                projection,
                srcOptions.featureProjection,
                srcOptions.extentProjection,
                srcOptions.dataProjection,
                additionalParameters
            );
        };
        return super._createSourceOptions(srcOptions);
    }

    loader(url, extent, resolution, projection, featureProjection, extentProjection, dataProjection, additionalParameters) {
        var self = this;
        if (angular.isDefined(extentProjection)) {
            extent = transformExtent(extent, projection.getCode(), extentProjection);
        }
        var params = [
            'srs=' + extentProjection,
            'bbox=' + extent.join(','),
            'resolution=' + resolution,
            'zoom=' + self.map.getView().getZoom()
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
            self.responseHandler(response, featureProjection, dataProjection);
        });
    }
    responseHandler(response, featureProjection, dataProjection) {
        var self = this;
        self.olLayer.getSource().clear();

        var format = new GeoJSON({
            dataProjection: dataProjection,
        });
        var features = format.readFeatures(
            response, {
                dataProjection: dataProjection,
                featureProjection: featureProjection
            }
        );
        self.olLayer.getSource().addFeatures(features);
    }
    refresh() {
        this._refresh();
    }
}

export default BBOXGeoJSON;
