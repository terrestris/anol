/**
 * @ngdoc object
 * @name anol.layer.WMTS
 *
 * @param {Object} options AnOl Layer options
 * @param {Object} options.olLayer Options for ol.layer.Tile
 * @param {Object} options.olLayer.source Options for ol.source.WMTS
 * @param {string} options.olLayer.source.capabilitiesUrl Url to WMTS capabilities document
 *
 * @description
 * Inherits from {@link anol.layer.Layer anol.layer.Layer}.
 *
 * In options.olLayer.source you can either specify *capabilitiesUrl*
 * or *url*, *layer*, *format* and *extent*.
 * For both variants, *projection* and *matrixSet* is required.
 * Without capabilitiesUrl you can also specify *levels* in source options.
 * The default value is 22.
 */

import AnolBaseLayer from '../layer.js';

import TileLayer from 'ol/layer/Tile';
import WMTSSource from 'ol/source/WMTS';
import WMTSTileGrid from 'ol/tilegrid/WMTS';
import { getWidth, getHeight, getTopLeft} from 'ol/extent';
import { DEVICE_PIXEL_RATIO } from 'ol/has';

class WMTS extends AnolBaseLayer {

    constructor(_options) {
        var defaults = {
            olLayer: {
                source: {
                    tileSize: [256, 256],
                    levels: 22
                }
            }
        };
        var options = $.extend(true, {}, defaults, _options );
        super(options);
        this.constructorOptions = angular.copy(_options);
        this.CLASS_NAME = 'anol.layer.WMTS';
        this.OL_LAYER_CLASS = TileLayer;
        this.OL_SOURCE_CLASS = WMTSSource;
    }
    _createResolution(levels, minRes) {
        var resolutions = [];
        for(var z = 0; z < levels; ++z) {
            resolutions[z] = minRes / Math.pow(2, z);
        }
        return resolutions;
    }
    _createMatrixIds(levels) {
        var matrixIds = [];
        for(var z = 0; z < levels; ++z) {
            matrixIds[z] = z;
        }
        return matrixIds;
    }
    _createRequestUrl(options) {
        return options.url +
               options.layer +
               '/{TileMatrixSet}/{TileMatrix}/{TileCol}/{TileRow}.' +
               options.format.split('/')[1];
    }
    _createSourceOptions(srcOptions) {
        srcOptions = super._createSourceOptions(srcOptions);
        var hqUrl = srcOptions.hqUrl || false;
        delete srcOptions.hqUrl;
        var hqLayer = srcOptions.hqLayer || false;
        delete srcOptions.hqLayer;
        var hqMatrixSet = srcOptions.hqMatrixSet || false;
        delete srcOptions.hqMatrixSet;

        let useHq = false;
        if(DEVICE_PIXEL_RATIO > 1) {
            if(hqUrl !== false) {
                srcOptions.url = hqUrl;
                useHq = true;
            }
            if(hqLayer !== false) {
                srcOptions.layer = hqLayer;
                useHq = true;
            }
            if(hqMatrixSet !== false) {
                srcOptions.matrixSet = hqMatrixSet;
                useHq = true;
            }
        }
        var levels = srcOptions.levels;
        var extent = srcOptions.extent || srcOptions.projection.getExtent();
        var w = getWidth(extent);
        var h = getHeight(extent);
        var minRes = Math.max(w / srcOptions.tileSize[0], h / srcOptions.tileSize[1]);
        var url = this._createRequestUrl(srcOptions);
        srcOptions = $.extend(true, {}, srcOptions, {
            url: url,
            tileSize: useHq ? srcOptions.tileSize.map(val => val * 2) : srcOptions.tileSize,
            tileGrid: new WMTSTileGrid({
                extent: extent,
                origin: getTopLeft(extent),
                resolutions: this._createResolution(levels, minRes),
                matrixIds: this._createMatrixIds(levels),
                tileSize: srcOptions.tileSize
            }),
            requestEncoding: 'REST',
            style: 'default'
        });

        return srcOptions;
    }
    isCombinable() {
        return false;
    }
}

export default WMTS;
