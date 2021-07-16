angular.module('anol')
    .factory('$olOn', ['$rootScope', function ($rootScope) {
        return function (olObject, event, callback) {
            return olObject.on(event, function (e) {
                $rootScope.$applyAsync(function () {
                    callback(e);
                });
            });
        }
    }])
    .service('ReadyService', ['$rootScope', '$timeout', 'MapService', function ($rootScope, $timeout, MapService) {
        class ReadyService {
            constructor () {
                this.required = [];
            }

            waitFor (name) {
                this.required.push(name);
            }

            notifyAboutReady (name) {
                this.required = this.required.flatMap(elem => elem === name ? [] : [elem]);
                if (this.required.length === 0) {
                    $rootScope.appReady = true;
                    // must happen after next cycle, i.e. after $timeout(.., 0)
                    $timeout(() => MapService.getMap().updateSize(), 10);
                }
            }
        }

        return new ReadyService();
    }]);
