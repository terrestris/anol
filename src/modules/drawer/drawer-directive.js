import './module.js';

import templateHTML from './templates/drawer.html';

angular.module('anol.drawer')
    .directive('anolDrawer', [
        function () {
            return {
                restrict: 'A',
                scope: {
                    'open': '<?',
                    'label': '<?'
                },
                replace: true,
                transclude: true,
                template: function (tElement, tAttrs) {
                    if (tAttrs.templateUrl) {
                        return '<div></div>';
                    }
                    return templateHTML;
                },
                link: function (scope, element, attrs) {
                    if (angular.isUndefined(scope.open)) {
                        scope.open = true;
                    }
                }
            }
        }
    ]);
