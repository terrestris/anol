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
                this.changeListenerKeys = [];
            }

            /**
             * @param {() => void} handler
             */
            register (handler) {
                if (this.addListenerKey) {
                    unByKey(this.addListenerKey);
                }
                for (const changeListenerKey of this.changeListenerKeys) {
                    unByKey(changeListenerKey);
                }
                this.changeListenerKeys = [];

                const createDigitizeStateHandler = feature => {
                    return () => {
                        if (feature.get('_digitizeState') !== undefined) {
                            handler();
                        }
                    };
                }

                this.addListenerKey = this.source.on('addfeature', e => {
                    const feature = e.feature;
                    const digitizeStateHandler = createDigitizeStateHandler(feature);
                    const listenerKey = feature.on('change:_digitizeState', digitizeStateHandler);
                    this.changeListenerKeys.push(listenerKey);
                });

                for (const feature of this.source.getFeatures()) {
                    const digitizeStateHandler = createDigitizeStateHandler(feature);
                    const listenerKey = feature.on('change:_digitizeState', digitizeStateHandler);
                    this.changeListenerKeys.push(listenerKey);
                }
            }

            unregister () {
                if (angular.isDefined(this.addListenerKey)) {
                    unByKey(this.addListenerKey);
                    this.addListenerKey = undefined;
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
        var _pollingUrl;
        var _pollingInterval;
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

        this.setPollingUrl = function(pollingUrl) {
          _pollingUrl = pollingUrl;
        }

        this.setPollingInterval = function(pollingInterval) {
          _pollingInterval = pollingInterval;
        }

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

        this.$get = ['$rootScope', '$q', '$http', '$interval', '$translate', function($rootScope, $q, $http, $interval, $translate) {
            /**
             * @ngdoc service
             * @name anol.savemanager.SaveManagerService
             *
             * @description
             * Collects changes in saveable layers and send them to given saveUrl
             */
            var SaveManager = function(saveNewFeaturesUrl, saveChangedFeaturesUrl, saveRemovedFeaturesUrl, pollingUrl, pollingInterval, saveableLayers) {
                var self = this;
                this.saveNewFeaturesUrl = saveNewFeaturesUrl;
                this.saveChangedFeaturesUrl = saveChangedFeaturesUrl;
                this.saveRemovedFeaturesUrl = saveRemovedFeaturesUrl;
                this.pollingUrl = pollingUrl;
                this.pollingInterval = pollingInterval;
                this.activePollingIntervals = {};
                this.lastPollingResults = {};
                this.changedLayers = {};

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
                            () => self.updateLayerChanged(layer)
                        );
                    } else {
                        layerListener.unregister();
                    }
                });
            };

            /**
             * Update layerChanged state of given layer.
             * @param {anol.layer.Feature} layer
             */
            SaveManager.prototype.updateLayerChanged = function(layer) {
                const possibleStates = [DigitizeState.NEW, DigitizeState.CHANGED, DigitizeState.REMOVED];
                const changed = layer.getFeatures().some(feat => possibleStates.includes(feat.get('_digitizeState')));

                if (changed && !(layer.name in this.changedLayers)) {
                    this.changedLayers = {
                      ...this.changedLayers,
                      [layer.name]: layer
                    }
                }
                else if (!changed && layer.name in this.changedLayers) {
                    const {
                      [layer.name]: _,
                      ...changedLayers
                    } = this.changedLayers;
                    this.changedLayers = {...changedLayers};
                }
            };

            /**
             * private function
             *
             * cleans up after changes done
             */
            SaveManager.prototype.changesDone = function(layerName) {
                delete this.changedLayers[layerName];
            };

            /**
             * Get features with given state.
             * @param {string} layerName The layer to get the features from.
             * @param {DigitizeState[keyof DigitizeState]} state The digitizeState to filter by.
             * @returns The list of features.
             */
            SaveManager.prototype.getFeatures = function(layerName, state) {
              const layer = this.changedLayers[layerName];
              if (!layer) {
                return [];
              }
              return layer.getFeatures().filter(f => f.get('_digitizeState') === state);
            }

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
                    const addedFeatures = this.getFeatures(layer.name, DigitizeState.NEW);
                    if (addedFeatures.length > 0) {
                        var data = {
                            name: layer.name,
                            featureCollection: {
                                type: 'FeatureCollection',
                                features: addedFeatures.map(writeFeature)
                            }
                        };
                        var promise = $http.post(this.saveNewFeaturesUrl, data);
                        promises.push(promise);
                    }
                    const changedFeatures = this.getFeatures(layer.name, DigitizeState.CHANGED);
                    if (changedFeatures.length > 0) {
                        var data = {
                            name: layer.name,
                            featureCollection: {
                                type: 'FeatureCollection',
                                features: changedFeatures.map(writeFeature)
                            }
                        };
                        var promise = $http.put(this.saveChangedFeaturesUrl, data);
                        promises.push(promise);
                    }
                    const removedFeatures = this.getFeatures(layer.name, DigitizeState.REMOVED);
                    if (removedFeatures.length > 0) {
                        var data = {
                            name: layer.name,
                            featureCollection: {
                                type: 'FeatureCollection',
                                features: removedFeatures.map(writeFeature)
                            }
                        }
                        var promise = $http.post(this.saveRemovedFeaturesUrl, data);
                        promises.push(promise);
                    }
                    $q.all(promises).then(function(responses) {
                        layer.refresh();
                        self.changesDone(layer.name);
                        var responses_data = [];
                        angular.forEach(responses, function(response) {
                          responses_data.push({
                            status: response.status,
                            data: response.data
                          });
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

            /**
             * Check if layer has changes.
             * @param {string} layerName The name of the layer to check.
             * @returns True, if layer has changes. False, otherwise.
             */
            SaveManager.prototype.hasChanges = function (layerName) {
                return layerName in this.changedLayers;
            }

            /**
             * Start polling for changes in backend.
             * @param {string} layerName Name of the layer to poll.
             * @param {Function} success_cb Callback when polling succeeded.
             * @param {Function} error_cb Callback when polling failed.
             * @returns
             */
            SaveManager.prototype.startPolling = function(layerName, success_cb, error_cb) {
                if (this.activePollingIntervals[layerName]) {
                    console.log(`Cannot start polling. Polling for layer ${layerName} already started.`);
                    return;
                }
                var self = this;
                this.activePollingIntervals[layerName] = $interval(function() {
                    var url = self.pollingUrl + '?layer=' + layerName;
                    $http.get(url).then(function(resp) {
                        self.lastPollingResults[layerName] = resp.data;
                        success_cb(resp.data, resp.status);
                    }, function(resp) {
                        error_cb(resp.data, resp.status)
                    });
                }, this.pollingInterval);
            };

            /**
             * Stop polling for changes in backend.
             * @param {string} layerName Name of the layer to stop polling for.
             * @returns
             */
            SaveManager.prototype.stopPolling = function(layerName) {
                var interval = this.activePollingIntervals[layerName];
                if (!interval) {
                    console.log(`Cannot stop polling. Polling for layer ${layerName} not started.`);
                    return;
                }
                $interval.cancel(interval);
                this.activePollingIntervals[layerName] = undefined;
            };

            /**
             * Check if polling contains changes for the given layer.
             * @param {anol.layer.Feature} layer The layer to check for.
             * @returns True, if polling contains changes. False, otherwise.
             */
            SaveManager.prototype.hasPollingChanges = function(layer) {
                if (!layer) {
                    return false;
                }
                var layerName = layer.name;
                var pollingResult = this.lastPollingResults[layerName];
                if (!pollingResult) {
                    return false;
                }

                var features = layer.getFeatures();
                // changed if matching polling feature has newer timestamp
                // changed if feat has id and no matching polling feature
                var hasChanges = features
                    .filter(f => [DigitizeState.CHANGED, DigitizeState.REMOVED].includes(f.get('_digitizeState')))
                    .some(feat => {
                        var pollingItem = pollingResult.find(item => item.id === feat.getId());
                        if (pollingItem) {
                            var pollingModified = new Date(pollingItem.modified);
                            var featureModified = new Date(feat.get('modified'));
                            // feature was modified on remote
                            if (pollingModified > featureModified) {
                                return true;
                            }
                            return false;
                        }
                        // feature was deleted on remote
                        return true;
                    });

                if (hasChanges) {
                    return true;
                }

                // changed if pollingitem has entry that is not in current features
                return pollingResult.some(pollingItem =>
                    features.find(f => f.getId() === pollingItem.id) === undefined
                );
            };

            /**
             * Refresh the given layer based on the polling results.
             *
             * All features will be called from backend. Added features will be kept.
             * Changed features will only be kept, if they were not modified in backend.
             * Deleted features will only be kept, if they were not modified in backend.
             *
             * @param {anol.layer.Feature} layer The layer to refresh.
             * @param {ol.Feature[]} addedFeatures List of added features.
             * @param {ol.Feature[]} changedFeatures List of changed features.
             * @param {olFeature[]} removedFeatures List of removed features.
             * @returns
             */
            SaveManager.prototype.refreshLayerByPollingResult = function (layer, addedFeatures, changedFeatures, removedFeatures) {
                if (!layer) {
                    return;
                }
                var layerName = layer.name;
                var pollingResult = this.lastPollingResults[layerName];
                if (!pollingResult) {
                    return;
                }

                // filter features that have no conflicts,
                // i.e. that were not changed/deleted on remote
                var filterNoConflicts = function(feat) {
                    var pollingItem = pollingResult.find(function(item) {
                        return feat.getId() === item.id;
                    });
                    // remote deleted
                    if (!pollingItem) {
                        return false;
                    }
                    var featureModified = new Date(feat.get('modified'));
                    var pollingModified = new Date(pollingItem.modified);
                    // remote changed
                    if (pollingModified > featureModified) {
                        return false;
                    }
                    return true;
                };

                changedFeatures
                    .filter(filterNoConflicts)
                    .forEach(feat => {
                        const layerFeature = layer.getFeatures().find(f => f.getId() === feat.getId());
                        layerFeature.setProperties(feat.getProperties());
                    });

                removedFeatures
                    .filter(filterNoConflicts)
                    .forEach(feat => {
                        const layerFeature = layer.getFeatures().find(f => f.getId() === feat.getId());
                        layerFeature.setProperties(feat.getProperties());
                    });

                // add addedFeatures to layer
                layer.addFeatures(addedFeatures);
                this.updateLayerChanged(layer);
            };

            /**
             * Refresh given layer based on polling results.
             * @param {anol.layer.Feature} layer The layer to refresh.
             * @returns
             */
            SaveManager.prototype.refreshLayer = function(layer) {
                var self = this;
                if (!layer) {
                    return;
                }
                var layerName = layer.name;
                // keep references of edited features before refreshing layer
                var addedFeatures = this.getFeatures(layerName, DigitizeState.NEW);
                var changedFeatures = this.getFeatures(layerName, DigitizeState.CHANGED);
                var removedFeatures = this.getFeatures(layerName, DigitizeState.REMOVED);
                var unregister = $rootScope.$watch(function() {
                    return layer.loaded;
                }, function(loaded) {
                    if(loaded === true) {
                        // we only want to watch until loaded is true once
                        unregister();
                        self.refreshLayerByPollingResult(layer, addedFeatures, changedFeatures, removedFeatures);
                    }
                });
                layer.refresh();
            };

            _saveManagerInstance = new SaveManager(
                _saveNewFeaturesUrl,
                _saveChangedFeaturesUrl,
                _saveRemovedFeaturesUrl,
                _pollingUrl,
                _pollingInterval,
                _saveableLayers
            );
            return _saveManagerInstance;
        }];
    }]);
