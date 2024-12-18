import './module.js';
import Style from 'ol/style/Style';
import Fill from 'ol/style/Fill';
import Stroke from 'ol/style/Stroke';
import CircleStyle from 'ol/style/Circle';
import Collection from 'ol/Collection';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import PointerInteraction from 'ol/interaction/Pointer';
import Modify from 'ol/interaction/Modify';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import Polygon from 'ol/geom/Polygon';
import { never } from 'ol/events/condition';
import { getSize } from 'ol/extent';

angular.module('anol.print')

  /**
   * @ngdoc object
   * @name anol.print.PrintPageServiceProvider
   */
  .provider('PrintPageService', [function () {
    // Better move directive configuration in directive so
    // direcitve can be replaced by custom one?
    var _pageLayouts, _outputFormats, _defaultScale, _style, _availableScales, _pageMargins, _minPageSize, _maxPageSize;
    var _allowPageResize = true;

    /**
 * @ngdoc method
 * @name setPageSizes
 * @methodOf anol.print.PrintPageServiceProvider
 * @param {Array.<Object>} pageLayouts List of page sizes.
 * Each page size is an object, containing the following elements
 * - **id** - {string} - Unique page size id
 * - **label** - {string} - Label of defined page size. Will be displayed in html
 * - **icon** - {string} - Icon of defined page size
 * - **mapSize** - {Array.<number>} - Height, width of map to print
 */
    this.setPageLayouts = function (pageLayouts) {
      _pageLayouts = pageLayouts;
    };
    /**
 * @ngdoc method
 * @name setOutputFormats
 * @methodOf anol.print.PrintPageServiceProvider
 * @param {Array.<Object>} outputFormats List of available output formats
 * Each output format is an object, containing the following elements
 * - **label** - {string} - Label of defined output format. Will be displayed in html
 * - **value** - {string} - File format ending
 */
    this.setOutputFormats = function (outputFormats) {
      _outputFormats = outputFormats;
    };
    /**
 * @ngdoc method
 * @name setDefaultScale
 * @methodOf anol.print.PrintPageServiceProvider
 * @param {number} scale Initial scale
 */
    this.setDefaultScale = function (scale) {
      _defaultScale = scale;
    };
    /**
 * @ngdoc method
 * @name setAvailableScales
 * @methodOf anol.print.PrintPageServiceProvider
 * @param {Array.<number>} scales Available scales
 */
    this.setAvailableScales = function (scales) {
      _availableScales = scales;
    };
    /**
 * @ngdoc method
 * @name setStyle
 * @methodOf anol.print.PrintPageServiceProvider
 * @param {Object} ol3 style object
 * @description
 * Define styling of print page feature displayed in map
 */
    this.setStyle = function (style) {
      _style = style;
    };
    /**
 * @ngdoc method
 * @name setPageResize
 * @methodOf anol.print.PrintPageServiceProvider
 * @param {boolean} allowed Allow / disallow page resize in map
 * @description
 * Allow / disallow page resize in map
 */
    this.setPageResize = function (allowed) {
      _allowPageResize = allowed;
    };

    this.setPageMargins = function (margins) {
      _pageMargins = margins || [0, 0, 0, 0];
    };

    this.setMinPageSize = function (size) {
      _minPageSize = size;
    };

    this.setMaxPageSize = function (size) {
      _maxPageSize = size;
    };

    this.$get = ['$rootScope', '$translate', 'MapService', 'LayersService', 'InteractionsService', 'NotificationService', function ($rootScope, $translate, MapService, LayersService, InteractionsService, NotificationService) {
      /**
       * @ngdoc service
       * @name anol.print.PrintPageService
       * @requires $rootScope
       * @requires anol.map.MapService
       * @requires anol.map.LayersService
       * @requires anol.map.InteractionsService
       *
       * @description
       * Service for showing/hiding print area in map. It provides also the bbox of print area.
       */
      var _modify;
      var _drag;
      var _printArea;
      var _cursorPointer;
      var _dragFeatures = {
        lefttop: undefined,
        leftbottom: undefined,
        rightbottom: undefined,
        righttop: undefined
      };
      var _modifyFeatures = new Collection();

      var _printSource = new VectorSource();
      var defaultStyle = new Style({
        fill: new Fill({
          color: 'rgba(255, 255, 255, 0.4)'
        }),
        stroke: new Stroke({
          color: 'rgba(0, 0, 0, 1)',
          width: 1
        }),
        image: new CircleStyle({
          radius: 5,
          fill: new Fill({
            color: 'rgba(255, 255, 255, 1)'
          }),
          stroke: new Stroke({
            color: 'rgba(0, 0, 0, 1)',
            width: 1
          })
        })
      });
      // var style = $.extend({}, defaultStyle, _style);
      // TODO use anol.layer.Feature
      var _printLayer = new VectorLayer({
        source: _printSource,
        style: defaultStyle,
        zIndex: 2001
      });

      /**
       * This method rounds up to certain precision.
       * _ceilToPrecision(123213, 2) -> 130000
       * _ceilToPrecision(12.3213, 4) -> 12.33
       * Similar to Number.toPrecision but always rounding up.
       * @param {number} numb
       * @param {number} precision
       * @returns {number}
       * @private
       */
      const _ceilToPrecision = (numb, precision) => {
        const unsignificant = Math.pow(10, Math.ceil(Math.log10(numb)) - precision);
        return Math.ceil(numb / unsignificant) * unsignificant;
      }

      // TODO replace ol3 styling by anol.layerFeature styling
      // if(_style) {
      //     _printLayer.setStyle(_style);
      // }
      var layerOptions = {
        title: 'PrintLayer',
        displayInLayerswitcher: false,
        olLayer: _printLayer
      };

      LayersService.addSystemLayer(new anol.layer.Layer(layerOptions), 0);

      class CursorPointerInteraction extends PointerInteraction {
        constructor(options = {}) {
          super({
            handleMoveEvent: CursorPointerInteraction.prototype.handleMoveEvent
          });
          this.cursor_ = 'pointer';
          this.previousCursor_ = undefined;

          this.features = options.features;
          this.layer = options.layer;
        }

        handleMoveEvent(evt) {
          var self = this;
          if (self.cursor_) {
            var map = evt.map;
            var feature = map.forEachFeatureAtPixel(evt.pixel,
              function (feature, layer) {
                if (layer == self.layer && $.inArray(feature, self.faetures)) {
                  return feature;
                }
              });
            var element = evt.map.getTargetElement();
            if (feature) {
              if (element.style.cursor != self.cursor_) {
                self.previousCursor_ = element.style.cursor;
                element.style.cursor = self.cursor_;
              }
            } else if (angular.isDefined(self.previousCursor_)) {
              element.style.cursor = self.previousCursor_;
              self.previousCursor_ = undefined;
            }
          }
        }
      }

      class DragPrintPageInteraction extends PointerInteraction {
        constructor(options = {}) {
          super({
            handleDownEvent: DragPrintPageInteraction.prototype.handleDownEvent,
            handleDragEvent: DragPrintPageInteraction.prototype.handleDragEvent,
            handleUpEvent: DragPrintPageInteraction.prototype.handleUpEvent
          });
          this.coordinate_ = null;
          this.feature_ = null;

          this.dragCallback = options.dragCallback;
          this.pageFeature = options.pageFeature;
          this.pageLayer = options.pageLayer;
        }

        handleDownEvent(evt) {
          var self = this;
          var map = evt.map;
          var features = [];
          map.forEachFeatureAtPixel(evt.pixel,
            function (feature, layer) {
              if (layer !== self.pageLayer) {
                return;
              }
              features.push(feature);
            });

          if (features.length === 1 && features[0] === self.pageFeature) {
            this.coordinate_ = evt.coordinate;
            this.feature_ = self.pageFeature;
            return true;
          }

          return false;
        }

        handleDragEvent(evt) {
          var deltaX = evt.coordinate[0] - this.coordinate_[0];
          var deltaY = evt.coordinate[1] - this.coordinate_[1];
          var geometry = this.feature_.getGeometry();
          geometry.translate(deltaX, deltaY);
          this.coordinate_[0] = evt.coordinate[0];
          this.coordinate_[1] = evt.coordinate[1];
          if (angular.isDefined(this.dragCallback)) {
            this.dragCallback(evt);
          }
        }

        handleUpEvent() {
          this.coordinate_ = null;
          this.feature_ = null;
          return false;
        }
      }

      /**
   * @ngdoc service
   * @name anol.print.PrintPageService
   *
   * @requires $rootScope
   * @requires MapService
   * @requires LayersService
   * @requires InteractionsService
   *
   * @description
   * Provides a rectabgular ol geometry representing a paper size.
   * Geometry can be moved or resized. With a given scale, the needed
   * paper size for selected area is calculated.
   *
   */
      var PrintPage = function (pageLayouts, outputFormats, defaultScale, availableScales, allowPageResize, pageMargins, minPageSize, maxPageSize) {
        this.pageLayouts = pageLayouts;
        this.outputFormats = outputFormats;
        this.defaultScale = defaultScale;
        this.availableScales = availableScales;
        this.allowPageResize = allowPageResize;
        this.currentPageSize = undefined;
        this.currentScale = undefined;
        this.pageMargins = pageMargins;
        this.minPageSize = minPageSize;
        this.maxPageSize = maxPageSize;
        this.settings = {};

        var self = this;

        var translate = function () {
          $translate('anol.print.INVALID_WIDTH').then(
            function (translation) {
              self.invalidWidthText = translation;
            });
          $translate('anol.print.INVALID_HEIGHT').then(
            function (translation) {
              self.invalidHeightText = translation;
            });
          $translate('anol.print.WIDTH_REQUIRED').then(
            function (translation) {
              self.requiredWidthText = translation;
            });
          $translate('anol.print.HEIGHT_REQUIRED').then(
            function (translation) {
              self.requiredHeightText = translation;
            });
          $translate('anol.print.WIDTH_TOO_SMALL').then(
            function (translation) {
              self.widthTooSmallText = translation;
            });
          $translate('anol.print.HEIGHT_TOO_SMALL').then(
            function (translation) {
              self.heightTooSmallText = translation;
            });
          $translate('anol.print.WIDTH_TOO_BIG').then(
            function (translation) {
              self.widthTooBigText = translation;
            });
          $translate('anol.print.HEIGHT_TOO_BIG').then(
            function (translation) {
              self.heightTooBigText = translation;
            });
        };
        $rootScope.$on('$translateChangeSuccess', translate);
        translate();
      };
      /**
   * @ngdoc method
   * @name createPrintArea
   * @methodOf anol.print.PrintPageService
   *
   * @param {Array.<number>} pageSize Width, height of page in mm
   * @param {number} scale Map scale in printed output
   * @param {Array.<number>} center Center of print page. optional
   *
   * @description
   * Creates the print area geometry visible in map
   */
      PrintPage.prototype.createPrintArea = function (pageSize, scale) {
        var width = pageSize[0] - this.pageMargins[1] - this.pageMargins[3];
        var height = pageSize[1] - this.pageMargins[0] - this.pageMargins[2];
        this.currentPageSize = [width, height];
        this.currentScale = scale;
        this.mapWidth = this.currentPageSize[0] / 1000 * this.currentScale;
        this.mapHeight = this.currentPageSize[1] / 1000 * this.currentScale;

        var view = MapService.getMap().getView();
        var center = view.getCenter();
        var top = center[1] + (this.mapHeight / 2);
        var bottom = center[1] - (this.mapHeight / 2);
        var left = center[0] - (this.mapWidth / 2);
        var right = center[0] + (this.mapWidth / 2);

        _printSource.clear();
        _printArea = undefined;
        this.updatePrintArea(left, top, right, bottom);
        if (this.allowPageResize) {
          this.createDragFeatures(left, top, right, bottom, center);
        }
        this.createInteractions();
      };
      /**
   * @ngdoc method
   * @name removePrintArea
   * @methodOf anol.print.PrintPageService
   *
   * @description
   * Removes print area and all resize geometries
   */
      PrintPage.prototype.removePrintArea = function () {
        _printSource.clear();
        _printArea = undefined;
      };
      /**
   * @private
   * @name createDragFeatures
   * @methodOf anol.print.PrintPageService
   *
   * @param {number} left left coordinate
   * @prarm {number} top top coordinate
   * @param {number} right right coordinate
   * @param {number} bottom bottom coordinate
   * @param {Array.<number>} center center coordinates
   *
   * @description
   * Creates draggable points to modify print area
   */
      PrintPage.prototype.createDragFeatures = function (left, top, right, bottom, center) {
        var self = this;
        _modifyFeatures.clear();

        _dragFeatures.leftbottom = new Feature(new Point([left, bottom]));
        _dragFeatures.leftbottom.set('position', 'leftbottom');
        _modifyFeatures.push(_dragFeatures.leftbottom);

        _dragFeatures.lefttop = new Feature(new Point([left, top]));
        _dragFeatures.lefttop.set('position', 'lefttop');
        _modifyFeatures.push(_dragFeatures.lefttop);

        _dragFeatures.rightbottom = new Feature(new Point([right, bottom]));
        _dragFeatures.rightbottom.set('position', 'rightbottom');
        _modifyFeatures.push(_dragFeatures.rightbottom);

        _dragFeatures.righttop = new Feature(new Point([right, top]));
        _dragFeatures.righttop.set('position', 'righttop');
        _modifyFeatures.push(_dragFeatures.righttop);

        _printSource.addFeatures(_modifyFeatures.getArray());
      };

      PrintPage.prototype.createInteractions = function () {
        var self = this;
        if (_modify !== undefined) {
          InteractionsService.removeInteraction(_modify);
        }
        if (angular.isDefined(_drag)) {
          InteractionsService.removeInteraction(_drag);
        }
        if (angular.isDefined(_cursorPointer)) {
          InteractionsService.removeInteraction(_cursorPointer);
        }
        var modifyFeatures = new Collection();
        modifyFeatures.extend(_modifyFeatures);
        modifyFeatures.push(_printArea);
        var modifyOptions = {
          features: modifyFeatures,
          insertVertexCondition: never,
          deleteCondition: never
        };

        if (_style !== undefined) {
          modifyOptions.style = _style;
        }
        if (self.allowPageResize) {
          _modify = new Modify(modifyOptions);
          _modify.on('modifyend', function (e) {
            self.updateDragFeatures(e);
          });
        }
        _drag = new DragPrintPageInteraction({
          dragCallback: function (e) {
            self.updateDragFeatures(e);
          },
          pageFeature: _printArea,
          pageLayer: _printLayer
        });
        _cursorPointer = new CursorPointerInteraction({
          features: _modifyFeatures.getArray().concat(_printArea),
          layer: _printLayer
        });
        if (self.allowPageResize) {
          InteractionsService.addInteraction(_modify);
        }
        InteractionsService.addInteraction(_drag);
        InteractionsService.addInteraction(_cursorPointer);
      };
      /**
   * @private
   * @name updateDragFeatures
   * @methodOf anol.print.PrintPageService
   *
   * @param {Object} currentFeature dragged feature
   *
   * @description
   * Update draggable points after one points (currentFeature) was dragged
   */
      PrintPage.prototype.updateDragFeatures = function (e) {
        var self = this;
        // no need for update drag features if page cannot be resized in map
        if (!self.allowPageResize) {
          return;
        }

        var type;
        if (e && e.type) {
          type = e.type;
        }

        // new coords after dragging/modifiyng
        var edgePoints = _printArea.getGeometry().getCoordinates()[0];
        if (type == 'pointerdrag') {
          _dragFeatures.lefttop.getGeometry().setCoordinates(edgePoints[0]);
          _dragFeatures.righttop.getGeometry().setCoordinates(edgePoints[1]);
          _dragFeatures.rightbottom.getGeometry().setCoordinates(edgePoints[2]);
          _dragFeatures.leftbottom.getGeometry().setCoordinates(edgePoints[3]);

        } else if (type == 'modifyend') {
          // calculate which point was dragged

          //  .updatePrintArea = function(left, top, right, bottom) {
          var leftTopDragCoords = _dragFeatures.lefttop.getGeometry().getCoordinates();
          var leftBottomDragCoords = _dragFeatures.leftbottom.getGeometry().getCoordinates();
          var rightTopDragCoords = _dragFeatures.righttop.getGeometry().getCoordinates();
          var rightBottomDragCoords = _dragFeatures.rightbottom.getGeometry().getCoordinates();

          if (leftTopDragCoords.toString() != edgePoints[0].toString()) {
            var correctedEdgePoint = new Array();
            correctedEdgePoint[0] = this.checkPrintBoxWidth(rightBottomDragCoords, edgePoints[0], leftTopDragCoords);
            correctedEdgePoint[1] = this.checkPrintBoxHeight(rightBottomDragCoords, edgePoints[0], leftTopDragCoords);

            _modifyFeatures.remove(_dragFeatures.lefttop);
            _modifyFeatures.remove(_dragFeatures.righttop);
            _modifyFeatures.remove(_dragFeatures.leftbottom);
            _dragFeatures.lefttop.getGeometry().setCoordinates(correctedEdgePoint);
            _dragFeatures.righttop.getGeometry().setCoordinates([edgePoints[1][0], correctedEdgePoint[1]]);
            _dragFeatures.leftbottom.getGeometry().setCoordinates([correctedEdgePoint[0], edgePoints[3][1]]);
            _modifyFeatures.push(_dragFeatures.lefttop);
            _modifyFeatures.push(_dragFeatures.righttop);
            _modifyFeatures.push(_dragFeatures.leftbottom);
            this.updatePrintArea(correctedEdgePoint[0], correctedEdgePoint[1], rightBottomDragCoords[0], rightBottomDragCoords[1]);

          } else if (rightTopDragCoords.toString() != edgePoints[1].toString()) {
            var correctedEdgePoint = new Array();
            correctedEdgePoint[0] = this.checkPrintBoxWidth(leftBottomDragCoords, edgePoints[1], rightTopDragCoords);
            correctedEdgePoint[1] = this.checkPrintBoxHeight(leftBottomDragCoords, edgePoints[1], rightTopDragCoords);

            _modifyFeatures.remove(_dragFeatures.righttop);
            _modifyFeatures.remove(_dragFeatures.lefttop);
            _modifyFeatures.remove(_dragFeatures.rightbottom);
            _dragFeatures.righttop.getGeometry().setCoordinates(correctedEdgePoint);
            _dragFeatures.lefttop.getGeometry().setCoordinates([edgePoints[0][0], correctedEdgePoint[1]]);
            _dragFeatures.rightbottom.getGeometry().setCoordinates([correctedEdgePoint[0], edgePoints[2][1]]);
            _modifyFeatures.push(_dragFeatures.righttop);
            _modifyFeatures.push(_dragFeatures.lefttop);
            _modifyFeatures.push(_dragFeatures.rightbottom);
            this.updatePrintArea(leftBottomDragCoords[0], correctedEdgePoint[1], correctedEdgePoint[0], leftBottomDragCoords[1]);

          } else if (rightBottomDragCoords.toString() != edgePoints[2].toString()) {
            var correctedEdgePoint = new Array();
            correctedEdgePoint[0] = this.checkPrintBoxWidth(leftTopDragCoords, edgePoints[2], rightBottomDragCoords);
            correctedEdgePoint[1] = this.checkPrintBoxHeight(leftTopDragCoords, edgePoints[2], rightBottomDragCoords);

            _modifyFeatures.remove(_dragFeatures.rightbottom);
            _modifyFeatures.remove(_dragFeatures.righttop);
            _modifyFeatures.remove(_dragFeatures.leftbottom);
            _dragFeatures.rightbottom.getGeometry().setCoordinates(correctedEdgePoint);
            _dragFeatures.righttop.getGeometry().setCoordinates([correctedEdgePoint[0], edgePoints[1][1]]);
            _dragFeatures.leftbottom.getGeometry().setCoordinates([edgePoints[3][0], correctedEdgePoint[1]]);
            _modifyFeatures.push(_dragFeatures.rightbottom);
            _modifyFeatures.push(_dragFeatures.righttop);
            _modifyFeatures.push(_dragFeatures.leftbottom);
            this.updatePrintArea(leftTopDragCoords[0], leftTopDragCoords[1], correctedEdgePoint[0], correctedEdgePoint[1]);

          } else if (leftBottomDragCoords.toString() != edgePoints[3].toString()) {
            var correctedEdgePoint = new Array();
            correctedEdgePoint[0] = this.checkPrintBoxWidth(rightTopDragCoords, edgePoints[3], leftBottomDragCoords);
            correctedEdgePoint[1] = this.checkPrintBoxHeight(rightTopDragCoords, edgePoints[3], leftBottomDragCoords);

            _modifyFeatures.remove(_dragFeatures.leftbottom);
            _modifyFeatures.remove(_dragFeatures.rightbottom);
            _modifyFeatures.remove(_dragFeatures.lefttop);
            _dragFeatures.leftbottom.getGeometry().setCoordinates(correctedEdgePoint);
            _dragFeatures.rightbottom.getGeometry().setCoordinates([edgePoints[2][0], correctedEdgePoint[1]]);
            _dragFeatures.lefttop.getGeometry().setCoordinates([correctedEdgePoint[0], edgePoints[0][1]]);
            _modifyFeatures.push(_dragFeatures.leftbottom);
            _modifyFeatures.push(_dragFeatures.rightbottom);
            _modifyFeatures.remove(_dragFeatures.lefttop);
            this.updatePrintArea(correctedEdgePoint[0], rightTopDragCoords[1], rightTopDragCoords[0], correctedEdgePoint[1]);
          }


          this.updatePrintSize();
        }
      };

      /**
      * @private
      * @name checkPrintBoxWidth
      * @methodOf anol.print.PrintPageService
      *
      * @param {Array} refPointOppositeSite reference point before modifying print rectangle
      * @param {Array} newPoint new point after modifying print rectangle
      * @param {Array} oldPoint old point before modifying print rectangle
      *
      * @description
      * Calculates the new print rectangle width and restrict it to min and max width
      */
      PrintPage.prototype.checkPrintBoxWidth = function (refPointOppositeSite, newPoint, oldPoint) {

        var newWidth = refPointOppositeSite[0] - newPoint[0];
        var oldWidth = refPointOppositeSite[0] - oldPoint[0];
        var changedPositions = newWidth > 0 && oldWidth < 0 || newWidth < 0 && oldWidth > 0;
        var newWidthAbs = Math.abs(refPointOppositeSite[0] - newPoint[0]);

        var widthInPixels = Math.round(newWidthAbs * 1000 / this.currentScale);
        if (newWidth > 0) {
          if (changedPositions == true) {
            var newX = this.minPageSize / 1000 * this.currentScale;
            NotificationService.addError(deDETranslation.anol.print.WIDTH_TOO_SMALL + Math.round(this.minPageSize) + " mm");
            return refPointOppositeSite[0] + newX;
          } else if (widthInPixels < this.minPageSize) {
            var newX = this.minPageSize / 1000 * this.currentScale;
            NotificationService.addError(deDETranslation.anol.print.WIDTH_TOO_SMALL + Math.round(this.minPageSize) + " mm");
            return refPointOppositeSite[0] - newX;
          } else if (widthInPixels > this.maxPageSize) {
            var newX = this.maxPageSize / 1000 * this.currentScale;
            NotificationService.addError(deDETranslation.anol.print.WIDTH_TOO_BIG + Math.round(this.maxPageSize) + " mm");
            return refPointOppositeSite[0] - newX;
          }
        } else if (newWidth < 0) {
          if (changedPositions == true) {
            var newX = this.minPageSize / 1000 * this.currentScale;
            NotificationService.addError(deDETranslation.anol.print.WIDTH_TOO_SMALL + Math.round(this.minPageSize) + " mm");
            return refPointOppositeSite[0] - newX;
          } else if (widthInPixels < this.minPageSize) {
            var newX = this.minPageSize / 1000 * this.currentScale;
            NotificationService.addError(deDETranslation.anol.print.WIDTH_TOO_SMALL + Math.round(this.minPageSize) + " mm");
            return refPointOppositeSite[0] + newX;
          } else if (widthInPixels > this.maxPageSize) {
            var newX = this.maxPageSize / 1000 * this.currentScale;
            NotificationService.addError(deDETranslation.anol.print.WIDTH_TOO_BIG + Math.round(this.maxPageSize) + " mm");
            return refPointOppositeSite[0] + newX;
          }
        }
        return newPoint[0];
      };

      /**
       * @private
       * @name checkPrintBoxHeight
       * @methodOf anol.print.PrintPageService
       *
       * @param {Array} refPointOppositeSite reference point before modifying print rectangle
       * @param {Array} newPoint new point after modifying print rectangle
       * @param {Array} oldPoint old point before modifying print rectangle
       *
       * @description
       * Calculates the new print rectangle height and restrict it to min and max height
       */
      PrintPage.prototype.checkPrintBoxHeight = function (refPointOppositeSite, newPoint, oldPoint) {

        var newHeight = refPointOppositeSite[1] - newPoint[1];
        var oldHeight = refPointOppositeSite[1] - oldPoint[1];
        var changedPositions = newHeight > 0 && oldHeight < 0 || newHeight < 0 && oldHeight > 0;
        var newHeightAbs = Math.abs(refPointOppositeSite[1] - newPoint[1]);

        var heightInPixels = Math.round(newHeightAbs * 1000 / this.currentScale);
        if (newHeight > 0) {
          if (changedPositions == true) {
            var newY = this.minPageSize / 1000 * this.currentScale;
            NotificationService.addError(deDETranslation.anol.print.HEIGHT_TOO_SMALL + Math.round(this.minPageSize) + " mm");
            return refPointOppositeSite[1] + newY;
          } else if (heightInPixels < this.minPageSize) {
            var newY = this.minPageSize / 1000 * this.currentScale;
            NotificationService.addError(deDETranslation.anol.print.HEIGHT_TOO_SMALL + Math.round(this.minPageSize) + " mm");
            return refPointOppositeSite[1] - newY;
          } else if (heightInPixels > this.maxPageSize) {
            var newY = this.maxPageSize / 1000 * this.currentScale;
            NotificationService.addError(deDETranslation.anol.print.HEIGHT_TOO_BIG + Math.round(this.maxPageSize) + " mm");
            return refPointOppositeSite[1] - newY;
          }
        } else if (newHeight < 0) {
          if (changedPositions == true) {
            var newY = this.minPageSize / 1000 * this.currentScale;
            NotificationService.addError(deDETranslation.anol.print.HEIGHT_TOO_SMALL + Math.round(this.minPageSize) + " mm");
            return refPointOppositeSite[1] - newY;
          } else if (heightInPixels < this.minPageSize) {
            var newY = this.minPageSize / 1000 * this.currentScale;
            NotificationService.addError(deDETranslation.anol.print.HEIGHT_TOO_SMALL + Math.round(this.minPageSize) + " mm");
            return refPointOppositeSite[1] + newY;
          } else if (heightInPixels > this.maxPageSize) {
            var newY = this.maxPageSize / 1000 * this.currentScale;
            NotificationService.addError(deDETranslation.anol.print.HEIGHT_TOO_BIG + Math.round(this.maxPageSize) + " mm");
            return refPointOppositeSite[1] + newY;
          }
        }
        return newPoint[1];
      };

      /**
   * @private
   * @name updatePrintAreaDiagonal
   * @methodOf anol.print.PrintPageService
   *
   * @param {Object} currentFeature dragged feature
   *
   * @description
   * Calculates print area bbox after diagonal dragging
   */
      PrintPage.prototype.updatePrintAreaDiagonal = function (currentCoords) {
        var lefttop, righttop, leftbottom, rightbottom;
        var leftTopDragCoords = _dragFeatures.lefttop.getGeometry().getCoordinates();
        var leftBottomDragCoords = _dragFeatures.leftbottom.getGeometry().getCoordinates();
        var rightTopDragCoords = _dragFeatures.righttop.getGeometry().getCoordinates();
        var rightBottomDragCoords = _dragFeatures.rightbottom.getGeometry().getCoordinates();
        if (leftTopDragCoords.toString() == currentCoords.toString()) {
          this.updatePrintArea(leftTopDragCoords[0], leftTopDragCoords[1], rightBottomDragCoords[0], rightBottomDragCoords[1]);
        } else if (leftBottomDragCoords.toString() == currentCoords.toString()) {
          this.updatePrintArea(leftBottomDragCoords[0], rightTopDragCoords[1], rightTopDragCoords[0], leftBottomDragCoords[1]);
        } else if (rightTopDragCoords.toString() == currentCoords.toString()) {
          this.updatePrintArea(leftBottomDragCoords[0], rightTopDragCoords[1], rightTopDragCoords[0], leftBottomDragCoords[1]);
        } else if (rightBottomDragCoords.toString() == currentCoords.toString()) {
          this.updatePrintArea(leftTopDragCoords[0], leftTopDragCoords[1], rightBottomDragCoords[0], rightBottomDragCoords[1]);
        }
      };
      /**
   * @private
   * @name updatePrintAreaNormal
   * @methodOf anol.print.PrintPageService
   *
   * @param {Object} currentFeature dragged feature
   *
   * @description
   * Calculates print area bbox after horizontal or vertical dragging
   */
      PrintPage.prototype.updatePrintAreaNormal = function () {
        var left = _dragFeatures.left.getGeometry().getCoordinates()[0];
        var right = _dragFeatures.right.getGeometry().getCoordinates()[0];
        var top = _dragFeatures.top.getGeometry().getCoordinates()[1];
        var bottom = _dragFeatures.bottom.getGeometry().getCoordinates()[1];

        this.updatePrintArea(left, top, right, bottom);
      };
      /**
   * @private
   * @name updatePrintAreaCenter
   * @methodOf anol.print.PrintPageService
   *
   * @param {Object} currentFeature dragged feature
   *
   * @description
   * Calculates print area bbox after center point was dragged
   */
      PrintPage.prototype.updatePrintAreaCenter = function (currentFeature) {
        var center = currentFeature.getGeometry().getCoordinates();
        var top = center[1] + (this.mapHeight / 2);
        var bottom = center[1] - (this.mapHeight / 2);
        var left = center[0] - (this.mapWidth / 2);
        var right = center[0] + (this.mapWidth / 2);
        this.updatePrintArea(left, top, right, bottom);
      };
      /**
   * @private
   * @name updatePrintArea
   * @methodOf anol.print.PrintPageService
   *
   * @param {number} left left coordinate
   * @param {number} top top coordinate
   * @param {number} right right coordinate
   * @param {number} bottom bottom coordinate
   *
   * @description
   * Updates print area geometry
   */
      PrintPage.prototype.updatePrintArea = function (left, top, right, bottom) {
        var coords = [[
          [left, top],
          [right, top],
          [right, bottom],
          [left, bottom],
          [left, top]
        ]];
        if (angular.isDefined(_printArea)) {
          _printArea.getGeometry().setCoordinates(coords);
        } else {
          _printArea = new Feature(new Polygon(coords));
          _printSource.addFeatures([_printArea]);
        }
      };
      /**
   * @private
   * @name updatePrintSize
   * @methodOf anol.print.PrintPageService
   *
   * @description
   * Recalculate page size in mm
   */
      PrintPage.prototype.updatePrintSize = function () {
        var self = this;
        $rootScope.$apply(function () {
          self.mapWidth = _dragFeatures.rightbottom.getGeometry().getCoordinates()[0] - _dragFeatures.leftbottom.getGeometry().getCoordinates()[0];
          self.mapHeight = _dragFeatures.righttop.getGeometry().getCoordinates()[1] - _dragFeatures.rightbottom.getGeometry().getCoordinates()[1];
          var w = Math.round(self.mapWidth * 1000 / self.currentScale);
          var h = Math.round(self.mapHeight * 1000 / self.currentScale);
          self.currentPageSize = [
            w,
            h
          ];
          $rootScope.$broadcast('updatePrintPageSize', [w, h]);
          $rootScope.$broadcast('updatePrintPageLayout', undefined);
        });
      };
      /**
   * @ngdoc method
   * @name addFeatureFromPageSize
   * @methodOf anol.print.PrintPageService
   *
   * @param {Array.<number>} pageSize Width, height of page in mm
   * @param {number} scale Map scale in printed output
   *
   * @description
   * Create or update print page geometry by given pageSize and scale
   */
      PrintPage.prototype.addFeatureFromPageSize = function (pageSize, scale) {
        if (!this.isValidPageSize(pageSize) || angular.isUndefined(scale) || isNaN(scale)) {
          return;
        }
        this.createPrintArea(pageSize, scale);
      };
      /**
   * @ngdoc method
   * @name getBounds
   * @methodOf anol.print.PrintPageService
   *
   * @returns {Array.<number>} Current bounds of area to print in map units
   *
   * @description
   * Returns the current print area bounds in map units
   */
      PrintPage.prototype.getBounds = function () {
        var bounds = [];
        bounds = _printArea.getGeometry().getExtent();
        return bounds;
      };
      /**
   * @ngdoc method
   * @name visible
   * @methodOf anol.print.PrintPageService
   *
   * @param {boolean} visibility Set page geometry visibility
   *
   * @description
   * Set visibility of print page geometry
   */
      PrintPage.prototype.visible = function (visibility) {
        _printLayer.setVisible(visibility);
      };

      PrintPage.prototype.validSize = function (size) {
        if (angular.isUndefined(size)) {
          return false;
        }
        if (isNaN(size)) {
          return false;
        }
        if (angular.isDefined(this.minPageSize) && size < this.minPageSize) {
          return false;
        }
        if (angular.isDefined(this.maxPageSize) && size > this.maxPageSize) {
          return false;
        }
        return true;
      };

      PrintPage.prototype.isValidPageSize = function (pageSize) {
        if (angular.isUndefined(pageSize)) {
          return false;
        }
        if (pageSize.length === 0) {
          return false;
        }
        if (!this.validSize(pageSize[0])) {
          return false;
        }
        if (!this.validSize(pageSize[1])) {
          return false;
        }
        return true;
      };

      PrintPage.prototype.mapToPageSize = function (mapSize) {
        var width = mapSize[0] + this.pageMargins[1] + this.pageMargins[3];
        var height = mapSize[1] + this.pageMargins[0] + this.pageMargins[2];
        return [width, height];
      };

      PrintPage.prototype.getSizeErrors = function (pageSize) {
        if (angular.isUndefined(pageSize) || pageSize.length === 0) {
          return {
            'width': this.requiredWidthText,
            'height': this.requiredHeightText
          };
        }

        var widthError;
        if (angular.isUndefined(pageSize[0]) || pageSize[0] === null) {
          widthError = this.requiredWidthText;
        }
        if (angular.isUndefined(widthError) && isNaN(pageSize[0])) {
          widthError = this.invalidWidthText;
        }
        if (angular.isUndefined(widthError) && angular.isDefined(this.minPageSize) && pageSize[0] < this.minPageSize) {
          widthError = this.widthTooSmallText + Math.round(this.minPageSize) + 'mm';
        }
        if (angular.isUndefined(widthError) && angular.isDefined(this.maxPageSize) && pageSize[0] > this.maxPageSize) {
          widthError = this.widthTooBigText + Math.round(this.maxPageSize) + 'mm';
        }

        var heightError;
        if (angular.isUndefined(pageSize[1]) || pageSize[1] === null) {
          heightError = this.requiredHeightText;
        }
        if (angular.isUndefined(heightError) && isNaN(pageSize[1])) {
          heightError = this.invalidHeightText;
        }
        if (angular.isUndefined(heightError) && angular.isDefined(this.minPageSize) && pageSize[1] < this.minPageSize) {
          heightError = this.heightTooSmallText + Math.round(this.minPageSize) + 'mm';
        }
        if (angular.isUndefined(heightError) && angular.isDefined(this.maxPageSize) && pageSize[1] > this.maxPageSize) {
          heightError = this.heightTooBigText + Math.round(this.maxPageSize) + 'mm';
        }
        return {
          'width': widthError,
          'height': heightError
        };
      };

      PrintPage.prototype.saveSettings = function (attr) {
        this.settings = {
          'scale': attr.scale,
          'outputFormat': attr.outputFormat,
          'layout': attr.layout,
          'pageSize': attr.pageSize,
          'streetIndex': attr.streetIndex,
          'cellsX': attr.cellsX,
          'cellsY': attr.cellsY
        };
      };

      PrintPage.prototype.loadSettings = function (attr) {
        this.settings = attr;
        $rootScope.$broadcast('updatePrintPageSettings', this.settings);
      };

      PrintPage.prototype.getSettings = function (attr) {
        return this.settings;
      };

      PrintPage.prototype.getScaleFromExtent = function (extent, mapSize, margin) {
        if (angular.isUndefined(margin)) {
          margin = 20;
        }

        const extendSize = getSize(extent);

        // substract margin to avoid having geometries directly at the edges of the page
        const widthScale = (extendSize[0] * 1000) / (mapSize[0] - margin);
        const heightScale = (extendSize[1] * 1000) / (mapSize[1] - margin);
        const preciseScale = Math.max(widthScale, heightScale);
        return _ceilToPrecision(preciseScale, 3)
      };

      PrintPage.prototype.getBoundsForCenterMapSizeScale = function (center, mapSize, scale) {
        var mapWidth = mapSize[0] / 1000 * scale;
        var mapHeight = mapSize[1] / 1000 * scale;

        var top = center[1] + (mapHeight / 2);
        var bottom = center[1] - (mapHeight / 2);
        var left = center[0] - (mapWidth / 2);
        var right = center[0] + (mapWidth / 2);
        return [left, bottom, right, top];
      };

      return new PrintPage(_pageLayouts, _outputFormats, _defaultScale, _availableScales, _allowPageResize, _pageMargins, _minPageSize, _maxPageSize);
    }];
  }]);
