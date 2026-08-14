import './module.js';
import Sortable from 'sortablejs';

angular.module('anol.layerswitcher')

    .directive('anolSortable', ['$timeout', function ($timeout) {
        return {
            restrict: 'A',
            require: 'ngModel',
            link: function (scope, element, attrs, ngModel) {
                var options = scope.$eval(attrs.anolSortable) || {};

                var sortable = Sortable.create(element[0], {
                    animation: 150,
                    delay: 200,
                    delayOnTouchOnly: true,
                    onEnd: function (evt) {
                        var oldIndex = evt.oldIndex;
                        var newIndex = evt.newIndex;

                        if (oldIndex === newIndex) return;

                        $timeout(function () {
                            var items = ngModel.$modelValue;
                            var item = items.splice(oldIndex, 1)[0];
                            items.splice(newIndex, 0, item);

                            if (options.update) {
                                options.update();
                            }
                        });
                    }
                });

                var onContextMenu = function(e) { e.preventDefault(); };
                element[0].addEventListener('contextmenu', onContextMenu);

                scope.$on('$destroy', function () {
                    sortable.destroy();
                    element[0].removeEventListener('contextmenu', onContextMenu);
                });
            }
        };
    }]);
