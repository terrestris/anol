import { anol } from '../../anol/anol.js';

angular.module('anol.transparencysettings', [])
    .service('TransparencyDialogService', function() {
        let dialogCounter = 0;

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
            dialogCounter += 1;
            return dialogCounter;
          }
        };
      });
