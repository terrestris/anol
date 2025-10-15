import { anol } from '../../anol/anol.js';

angular.module('anol.transparencysettings', [])
    .factory('TransparencyDialogService', ['$window', function($window) {
        let activeDialogData = null;
        let activeDialogId = null;

        return {
          openDialog: function(id, data) {
            activeDialogData = data;
            activeDialogId = id;
          },
          closeDialog: function() {
            activeDialogData = null;
            activeDialogId = null;
          },
          isActiveDialog: function(id) {
            return activeDialogData !== null && id === activeDialogId;
          },
          isOpen: function() {
            return activeDialogId !== null;
          },
          getActiveDialogData: function() {
            return activeDialogData;
          },
          createDialogId: function() {
            return $window.crypto.randomUUID();
          }
        };
      }]);
