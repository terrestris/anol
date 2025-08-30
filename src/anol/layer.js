/**
 * @ngdoc object
 * @name anol.layer.Layer
 *
 * @param {Object} options AnOl Layer options
 * @param {string} options.title Layer title
 * @param {string} options.displayInLayerswitcher Show in layerswitcher
 * @param {boolean} options.permalink Add layer to permalink url. Default true. When displayInLayerswitcher is false, permalink is always false.
 * @param {boolean} options.isBackground Define layer as background layer
 * @param {boolean} options.isSystem Define layer as system layer
 * @param {Object} options.featureinfo Stores informations for feature info
 * @param {string} options.featureinfo.target Target of *GetFeatureInfo* request for {@link api/anol.featureinfo anol.featureinfo}. Supported values are:
 * - *_popup* - Results displayed in a popup
 * - *_blank* - Results displayed in a new window/tab
 * - *[id]* - Id of html element to display results in
 * @param {Array<string>} options.featureinfo.properties List of feature properties to show in {@link api/anol.featurepopup anol.featurepopup}.
 * @param {number} options.featureinfo.featureCount FEATURE_COUNT parameter for getFeatureInfo requests
 * @param {Object} options.legend Stores informations for legend
 * @param {string} options.legend.type Type of legend entry. Supported values are:
 * - *point* - Extracts point style of vector layer for legend
 * - *line* - Extracts line style of vector layer for legend
 * - *polygon* - Extracts polygon style of vector layer for legend
 * - *GetLegendGraphic* - Use options.legend.url for legend
 * @param {string} options.legend.url Url to image for display in legend
 * @param {string} otpions.legend.target Id of html element to display legend image in. (Only for options.legend.type == 'GetLegendGraphic').
 *                                       If empty, legend image is shown in legend control
 * @param {Object} options.olLayer OpenLayers layer object
 *
 * @description
 * Object for wrapping ol3 layers and add properties to them
 * You can create a normal ol3 layer and give it to a anol.layer.Layer
 *
 * @example
 * ```js
 *   // create ol layer
 *   var olLayer = new ol.layer.Vector({
 *     source: new ol.source.Vector()
 *   });
 *   var anolLayer = new anol.layer.Layer({
 *     title: "Awesome layer",
 *     olLayer: olLayer
 *   });
 * ```
 */

import BaseLayer from 'ol/layer/Base';
import Source from 'ol/source/Source';
import { DEVICE_PIXEL_RATIO } from 'ol/has';
import Group from './layer/group';

class AnolBaseLayer {
    /** @type {Group|undefined} */
    anolGroup;

    constructor(options) {
        if(options === false) {
            return;
        }
        this.constructorOptions = angular.copy(options);
        this.CLASS_NAME = 'anol.layer.Layer';
        this.OL_LAYER_CLASS = undefined;
        this.OL_SOURCE_CLASS = undefined;
        this.DEFAULT_OPTIONS = {
            olLayer: {
                source: {}
            }
        };
        options = $.extend(true, {}, this.DEFAULT_OPTIONS, options);

        this.name = options.name;
        this.title = options.title;
        this.isBackground = options.isBackground || false;
        this.isSystem = options.isSystem || false;
        this.featureinfo = options.featureinfo || false;
        this.legend = options.legend || false;
        this.abstract = options.abstract || undefined;
        this.attribution = options.attribution || undefined;
        this.isVector = false;
        this.options = options;
        this.displayInLayerswitcher = anol.helper.getValue(options.displayInLayerswitcher, true);
        this._controls = [];
        this.combined = false;
        this.clusterOptions = options.cluster || false;
        this.unclusteredSource = undefined;
        this.selectClusterControl = undefined;

        this.catalog = options.catalog || false;
        this.catalogLayer = options.catalogLayer || false;
        this.groupLayer = false;
        this.metadataUrl = options.metadataUrl || false;
        this.searchConfig = options.searchConfig || [];
        // this.showConfig = false;

        if(this.displayInLayerswitcher === false) {
            this.permalink = false;
        } else {
            this.permalink = anol.helper.getValue(options.permalink, true);
        }

        // keep ability to create anol.layer.Layer with predefined olLayer
        // this is needed for system layers in measure/print/etc.
        if(options.olLayer instanceof BaseLayer) {
            this.olLayer = options.olLayer;
        }
        else {
            this.olSourceOptions = this._createSourceOptions(options.olLayer.source);
            delete options.olLayer.source;
            this.olLayerOptions = options.olLayer;
            this.olLayer = undefined;
        }

        var pageBody = angular.element(document).find('body');
        this.addWaiting = function() {
            pageBody.addClass('waiting');
        }
        this.removeWaiting = function() {
            pageBody.removeClass('waiting');
        }
    }
    setOlLayer(olLayer) {
        this.olLayer = olLayer;
    }
    removeOlLayer() {
        delete this.olLayer;
    }
    isCombinable(other) {
        return other.CLASS_NAME === this.CLASS_NAME;
    }
    isCombinableInGroup(other) {
        return false;
    }
    isClustered() {
        return false;
    }
    getCombinedLayer() {
        return undefined;
    }
    hasGroup() {
        if(angular.isDefined(this.anolGroup)) {
            return true;
        }
        return false;
    }
    getVisible() {
        if(angular.isUndefined(this.olLayer)) {
            return false;
        }
        return this.olLayer.getVisible();
    }
    setVisible(visible)  {
        const self = this;
        if (visible && this.hasGroup()) {
            if (this.anolGroup.singleSelect) {
                $.each(this.anolGroup.layers, function(idx, layer) {
                    // Only set other layers invisible, not the one we want to have visible.
                    // Otherwise the WMS param for that layer will be removed.
                    if (layer.getVisible() && layer !== self) {
                        layer.setVisible(false); // layer.setVisible will update WMS params
                    }
                });
            }
        }
        // For combined layers, visibility depends on at least
        // one other layer in combination being visible.
        let olLayerVisible = visible;
        if (this.combined && this.hasGroup()) {
            olLayerVisible = this.anolGroup.layers.some(l => l.getVisible());
        }
        this.olLayer.setVisible(olLayerVisible);
        angular.element(this).triggerHandler('anol.layer.visible:change', [this]);
    }
    onVisibleChange(func, context) {
        angular.element(this).on('anol.layer.visible:change', {'context': context}, func);
    }
    offVisibleChange(func) {
        angular.element(this).off('anol.layer.visible:change', func);
    }

    /* isConfigVisible() {
        return this.showConfig;
    }
    setConfigVisible(visible) {
        this.showConfig = visible;
    } */
    /**
     * @param {number} value
     */
    transparency(value) {  // getterSetter
        if (angular.isDefined(this.olLayer)) {
            if (!value && value !== 0) {
                return 1 - this.olLayer.getOpacity();
            } else if (value < 0) {
                value = 0;
            } else if (value > 1) {
                value = 1;
            }
            this.olLayer.setOpacity(1 - value);
        }
    }

    refresh() {
        if(this.olLayer instanceof BaseLayer) {
            this.olLayer.changed();
        }
    }
    _createSourceOptions(srcOptions) {
        srcOptions = srcOptions || {};
        if(angular.isDefined(srcOptions.tilePixelRatio)) {
            srcOptions.tilePixelRatio = DEVICE_PIXEL_RATIO > 1 ? srcOptions.tilePixelRatio : 1;
        }
        return srcOptions;
    }
}

export default AnolBaseLayer;
