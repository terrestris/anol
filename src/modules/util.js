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
    .service('ReadyService', ['$rootScope', function ($rootScope) {
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
                }
            }
        }

        return new ReadyService();
    }]);
