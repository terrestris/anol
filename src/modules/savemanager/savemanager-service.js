import './module.js';
import {DigitizeState} from "./digitize-state";
import GeoJSON from 'ol/format/GeoJSON';
import {unByKey} from 'ol/Observable';
import {omit as _omit} from 'lodash';

angular.module('anol.savemanager')

/**
 * @ngdoc object
 * @name anol.savemanager.SaveManagerServiceProvider
 */
    .provider('SaveManagerService', ['LayersServiceProvider', function(LayersServiceProvider) {
    // handles layer source change events and store listener keys for removing
    // listeners nicely
        class LayerListener {
            constructor(layer) {
                this.source = layer.olLayer.getSource();

                this.addListenerKey = undefined;
                this.removeListenerKey = undefined;
                this.changeListenerKeys = [];
            }

            /**
             * @param {(f: Feature) => void} addHandler
             * @param {(f: Feature) => void} removeHandler
             * @param {(f: Feature) => void} changeHandler
             */
            register (addHandler, removeHandler, changeHandler) {
                if (this.addListenerKey) {
                    unByKey(this.addListenerKey);
                }
                if (this.removeListenerKey) {
                    unByKey(this.removeListenerKey);
                }
                for (const changeListenerKey of this.changeListenerKeys) {
                    unByKey(changeListenerKey);
                }
                this.changeListenerKeys = [];

                this.addListenerKey = this.source.on('addfeature', e => {
                    const feature = e.feature;
                    if (angular.isDefined(addHandler)) {
                        addHandler(feature);
                    }
                    if (angular.isDefined(changeHandler)) {
                        this.changeListenerKeys.push(feature.on('change:_digitizeState', () => {
                            if (feature.get('_digitizeState') === DigitizeState.CHANGED) {
                                changeHandler(feature);
                            }
                        }));
                    }
                });

                this.removeListenerKey = this.source.on('removefeature', e => {
                    if (angular.isDefined(removeHandler)) {
                        removeHandler(e.feature);
                    }
                });

                if (angular.isDefined(changeHandler)) {
                    for (const feature of this.source.getFeatures()) {
                        this.changeListenerKeys.push(feature.on('change:_digitizeState', () => {
                            if (feature.get('_digitizeState') === DigitizeState.CHANGED) {
                                changeHandler(feature);
                            }
                        }));
                    }
                }
            }

            unregister () {
                if (angular.isDefined(this.addListenerKey)) {
                    unByKey(this.addListenerKey);
                    this.addListenerKey = undefined;
                }
                if (angular.isDefined(this.removeListenerKey)) {
                    unByKey(this.removeListenerKey);
                    this.removeListenerKey = undefined;
                }
                for (const changeListenerKey of this.changeListenerKeys) {
                    unByKey(changeListenerKey);
                    this.changeListenerKeys = [];
                }
            }
        }

        var _saveManagerInstance;
        var _saveNewFeaturesUrl;
        var _saveChangedFeaturesUrl;
        var _saveRemovedFeaturesUrl;
        var _saveableLayers = [];
        /**
         * @ngdoc method
         * @name setSaveNewFeaturesUrl
         * @methodOf anol.savemanager.SaveManagerServiceProvider
         * @param {String} saveUrl url to save new features changes to.
         */
        this.setSaveNewFeaturesUrl = function(saveUrl) {
            _saveNewFeaturesUrl = saveUrl;
        };

        this.setSaveChangedFeaturesUrl = function(saveUrl) {
            _saveChangedFeaturesUrl = saveUrl;
        };

        this.setSaveRemovedFeaturesUrl = function(saveUrl) {
            _saveRemovedFeaturesUrl = saveUrl;
        };

        LayersServiceProvider.registerAddLayerHandler(function(layer) {
            if(layer.saveable !== true) {
                return;
            }
            if(angular.isDefined(_saveManagerInstance)) {
                _saveManagerInstance.addLayer(layer);
            } else {
                _saveableLayers.push(layer);
            }
        });

        this.$get = ['$rootScope', '$q', '$http', '$timeout', '$translate', function($rootScope, $q, $http, $timeout, $translate) {
            /**
             * @ngdoc service
             * @name anol.savemanager.SaveManagerService
             *
             * @description
             * Collects changes in saveable layers and send them to given saveUrl
             */
            var SaveManager = function(saveNewFeaturesUrl, saveChangedFeaturesUrl, saveRemovedFeaturesUrl, saveableLayers) {
                var self = this;
                this.saveNewFeaturesUrl = saveNewFeaturesUrl;
                this.saveChangedFeaturesUrl = saveChangedFeaturesUrl;
                this.saveRemovedFeaturesUrl = saveRemovedFeaturesUrl;
                this.changedLayers = {};
                this.addedFeatures = {};
                this.changedFeatures = {};
                this.removedFeatures = {};

                angular.forEach(saveableLayers, function(layer) {
                    self.addLayer(layer);
                });

                var translate = function() {
                    $translate('anol.savemanager.SAVING_FAILED').then(
                        function(translation) {
                            self.savingFailedMessage = translation;
                        });
                };
                $rootScope.$on('$translateChangeSuccess', translate);
                translate();
            };
            /**
             * @ngdoc method
             * @name addLayer
             * @methodOd anol.savemanager.SaveManagerService
             * @param {anol.layer.Feature} layer layer to watch for changes
             */
            SaveManager.prototype.addLayer = function(layer) {
                var self = this;
                var layerListener = new LayerListener(layer);
                $rootScope.$watch(function() {
                    return layer.loaded;
                }, function(loaded) {
                    if(loaded === true) {
                        layerListener.register(
                            feature => self.featureAddedHandler(feature, layer),
                            feature => self.featureRemovedHandler(feature, layer),
                            feature => self.featureChangedHandler(feature, layer)
                        );
                    } else {
                        layerListener.unregister();
                    }
                });
            };
            /**
             * private function
             *
             * handler for ol3 feature added event
             */
            SaveManager.prototype.featureAddedHandler = function(feature, layer) {
                var self = this;
                self.addNewFeature(feature, layer);
                self.updatedLayerChanged(layer);
            };
            /**
             * private function
             *
             * handler for ol3 feature changed event
             */
            SaveManager.prototype.featureChangedHandler = function(feature, layer) {
                var self = this;
                self.addChangedFeature(feature, layer);
                self.updatedLayerChanged(layer);
            };
            /**
             * private function
             *
             * handler for ol3 feature removed event
             */
            SaveManager.prototype.featureRemovedHandler = function(feature, layer) {
                var self = this;
                self.addRemovedFeature(feature, layer);
                self.updatedLayerChanged(layer);
            };
            /**
             * private function
             *
             * adds a layer to list of layers with changes
             */
            SaveManager.prototype.addChangedLayer = function(layer) {
                var self = this;
                if(!(layer.name in self.changedLayers)) {
                // TODO find out why $apply already in progress
                    $timeout(function() {
                        $rootScope.$apply(function() {
                            self.changedLayers[layer.name] = layer;
                        });
                    });
                }
            };

            SaveManager.prototype.updatedLayerChanged = function(layer) {
                // TODO check if we also the the $rootScope.$apply handling as in addChangedLayer()
                var changed = false;
                if (this.isDefinedAndPopulated(this.addedFeatures, layer)) {
                    changed = true;
                }
                if (this.isDefinedAndPopulated(this.changedFeatures, layer)) {
                    changed = true;
                }
                if (this.isDefinedAndPopulated(this.removedFeatures, layer)) {
                    changed = true;
                }

                if (changed && !(layer.name in this.changedLayers)) {
                    this.changedLayers[layer.name] = layer;
                }
                else if (!changed && layer.name in this.changedLayers) {
                    delete this.changedLayers[layer.name];
                }
            };

            SaveManager.prototype.isDefinedAndPopulated = function (layersMap, layer) {
                return layer.name in layersMap && layersMap[layer.name].length > 0;
            };

            SaveManager.prototype.addNewFeature = function(feature, layer) {
              if (!(layer.name in this.addedFeatures)) {
                  this.addedFeatures[layer.name] = [];
              }
              this.addedFeatures[layer.name].push(feature);
              this.updatedLayerChanged(layer);
            };

            SaveManager.prototype.addChangedFeature = function(feature, layer) {
              // ignore added features
              if (this.isInAddedFeatures(feature, layer.name)) {
                  return;
              }
              if (!(layer.name in this.changedFeatures)) {
                  this.changedFeatures[layer.name] = [];
              }
              if (this.changedFeatures[layer.name].includes(feature)) {
                  return;
              }
              this.changedFeatures[layer.name].push(feature);
              this.updatedLayerChanged(layer);
            };

            SaveManager.prototype.addRemovedFeature = function(feature, layer) {
              // ignore added features
              if (this.isInAddedFeatures(feature, layer.name)) {
                  var featureIdx = this.addedFeatures[layer.name].indexOf(feature);
                  this.addedFeatures[layer.name].splice(featureIdx, 1);
                  return;
              }
              // remove from changedfeatures
              if (this.isInChangedFeatures(feature, layer.name)) {
                  var featureIdx = this.changedFeatures[layer.name].indexOf(feature);
                  this.changedFeatures[layer.name].splice(featureIdx, 1);
              }
              if (!(layer.name in this.removedFeatures)) {
                  this.removedFeatures[layer.name] = [];
              }
              if (this.removedFeatures[layer.name].includes(feature)) {
                  return;
              }
              this.removedFeatures[layer.name].push(feature);
              this.updatedLayerChanged(layer);
            };

            /**
             * Checks if a feature is an added feature.
             *
             * @param {ol.Feature} feature The feature to check.
             * @param {String} layerName The name of the layer to which the feature belongs.
             * @returns {boolean} True, if feature is in addedFeatures. False otherwise.
             */
            SaveManager.prototype.isInAddedFeatures = function(feature, layerName) {
              if (!(layerName in this.addedFeatures)) {
                  return false;
              }
              return this.addedFeatures[layerName].includes(feature);
            };

            /**
             * Checks if a feature is a changed feature.
             *
             * @param {ol.Feature} feature The feature to check.
             * @param {String} layerName The name of the layer to which the feature belongs.
             * @returns {boolean} True, if feature is in changedFeatures. False otherwise.
             */
            SaveManager.prototype.isInChangedFeatures = function(feature, layerName) {
              if (!(layerName in this.changedFeatures)) {
                  return false;
              }
              return this.changedFeatures[layerName].includes(feature);
            };

            /**
             * private function
             *
             * cleans up after changes done
             */
            SaveManager.prototype.changesDone = function(layerName) {
                delete this.changedLayers[layerName];
                delete this.addedFeatures[layerName];
                delete this.changedFeatures[layerName];
                delete this.removedFeatures[layerName];
            };

            /**
             * @ngdoc method
             * @name commit
             * @methodOd anol.savemanager.SaveManagerService
             * @param {anol.layer.Feature} layer
             * @description
             * Commits changes for given layer
             */
            SaveManager.prototype.commit = function(layer) {
                var self = this;
                var deferred = $q.defer();
                var format = new GeoJSON();

                var layerChanged = layer.name in self.changedLayers;

                if(layerChanged) {
                    var promises = [];
                    const writeFeature = feature => {
                        const featureObject = format.writeFeatureObject(feature);
                        return {
                            ...featureObject,
                            properties: _omit(featureObject.properties, '_digitizeState')
                        };
                    };
                    if (self.isDefinedAndPopulated(self.addedFeatures, layer)) {
                        var data = {
                            name: layer.name,
                            featureCollection: {
                                type: 'FeatureCollection',
                                features: self.addedFeatures[layer.name].map(writeFeature)
                            }
                        };
                        var promise = $http.post(self.saveNewFeaturesUrl, data);
                        promises.push(promise);
                    }
                    if (self.isDefinedAndPopulated(self.changedFeatures, layer)) {
                        var data = {
                            name: layer.name,
                            featureCollection: {
                                type: 'FeatureCollection',
                                features: self.changedFeatures[layer.name].map(writeFeature)
                            }
                        };
                        var promise = $http.put(self.saveChangedFeaturesUrl, data);
                        promises.push(promise);
                    }
                    if (self.isDefinedAndPopulated(self.removedFeatures, layer)) {
                        var ids = [];
                        angular.forEach(self.removedFeatures[layer.name], function(feature) {
                          var id = feature.getId();
                          if (!id) {
                            return;
                          }
                          ids.push(id);
                        });
                        var data = {
                            name: layer.name,
                            ids: ids
                        };
                        var promise = $http.post(self.saveRemovedFeaturesUrl, data);
                        promises.push(promise);
                    }
                    $q.all(promises).then(function(responses) {
                        layer.refresh();
                        self.changesDone(layer.name);
                        var responses_data = [];
                        angular.forEach(responses, function(response) {
                          responses_data.push(response.data);
                        });
                        deferred.resolve(responses_data);
                    }, function (response) {
                        layer.refresh();
                        self.changesDone(layer.name);
                        deferred.reject({'message': `${self.savingFailedMessage} (${response.status})`});
                    });
                } else {
                    deferred.reject('No changes for layer ' + layer.name + ' present');
                }

                return deferred.promise;
            };
            /**
             * @ngdoc method
             * @name commitAll
             * @methodOf anol.savemanager.SaveManagerService
             *
             * @description
             * Commit all changed layers
             */
            SaveManager.prototype.commitAll = function() {
                var self = this;
                var promises = [];
                angular.forEach(self.changedLayers, function(layer) {
                    promises.push(self.commit(layer));
                });
                return $q.all(promises);
            };

            SaveManager.prototype.hasChanges = function (layerName) {
                return layerName in this.changedLayers;
            }

            _saveManagerInstance = new SaveManager(_saveNewFeaturesUrl, _saveChangedFeaturesUrl, _saveRemovedFeaturesUrl, _saveableLayers);
            return _saveManagerInstance;
        }];
    }]);
