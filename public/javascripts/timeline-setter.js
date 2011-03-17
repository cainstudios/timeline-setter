(function(window, document, undefined){


  
  /*
    Mixins
  */
  
  /* Not Sure this is needed actually.
  // Various stateful variables;
  var cache     = {};
  var idCounter = 0;
  
  var renderable = function(obj) {
    obj.cid = function(){
      if(this._cid) return this._cid;
      this._cid = idCounter++;
      return this._cid;
    };
    
    obj.$ = function(query){
      return $(query, this.el);
    };
    
    obj.html = function(args){
      if(!this.cacheable) return this.template(args);
      var cid = this.cid();
      if(cache[cid]) return cache[cid].children();
      cache[cid] = $("<div/>").html(this.template(args));
      return cache[cid].children();
    };
    
    return obj;
  };
  */
  
  var observable = function(obj){
    obj.bind = function(cb){
      this._callbacks = this._callbacks || [];
      this._callbacks.push(cb);
    };
    
    obj.trigger = function(){
      if(!this._callbacks) return;
      for(var i = 0; callback = this._callbacks[i]; i++)
        callback.apply(this, arguments);
    };
    
    return obj;
  };

  var transformable = function(obj){
    obj.move = function(e){
      if(!e.type === "move" || !e.deltaX) return;
      if(_.isUndefined(this.currOffset)) this.currOffset = 0;
      this.currOffset += e.deltaX;
      this.el.css({"left" : this.currOffset});
    };
    
    obj.zoom = function(e){
      if(!e.type === "zoom") return;
      this.el.css({ "width": e.width });
    };
  };
  
  /*
    Plugins
  */
  var draggable = function(obj){
    var drag;
    function mousedown(e){
      e.preventDefault();
      drag = {x: e.pageX, y: e.pageY};
      e.type = "dragstart";
      obj.el.trigger(e);
    };

    function mousemove(e){
      e.preventDefault();
      if(!drag) return;
      e.type = "dragging";
      e = _.extend(e, {
        deltaX: e.pageX - drag.x, 
        deltaY: e.pageY - drag.y 
      });
      drag = {x: e.pageX, y: e.pageY};
      obj.el.trigger(e);
    };

    function mouseup(e){
      if(!drag) return;
      drag = null;
      e.type = "dragend";
      obj.el.trigger(e);
    };

    obj.el.bind("mousedown", mousedown);
    
    $(document).bind("mousemove", mousemove);
    $(document).bind("mouseup", mouseup);

    return obj;
  };
  
  // safari bug for too fast scrolling, h/t polymaps
  var safari = /WebKit\/533/.test(navigator.userAgent);
  var wheel = function(obj){
    function mousewheel(e){
      e.preventDefault();
      var delta = (e.wheelDelta || -e.detail);
      if(safari){
        var negative = delta < 0 ? -1 : 1;
        delta = Math.log(Math.abs(delta)) * negative * 2;
      };
      e.type = "scrolled";
      e.deltaX = delta;
      obj.el.trigger(e);
    };
    
    obj.el.bind("mousewheel DOMMouseScroll", mousewheel);
  };
  
  /*
    Utils
  */
  var Bounds = function(){
    this.min = +Infinity;
    this.max = -Infinity;
  };
  
  Bounds.prototype.extend = function(num){
    this.min = Math.min(num, this.min);
    this.max = Math.max(num, this.max);
  };
 
  
  Bounds.prototype.width = function(){
    return this.max - this.min;
  };
  
  Bounds.prototype.project = function(num, max){
    return (num - this.min) / this.width() * max;
  };
  
  
  // Handy dandy function to make sure that events are 
  // triggered at the same time on two objects.'
  
  var sync = function(origin, listener){
    var events = Array.prototype.slice.call(arguments, 2);
    _.each(events, function(ev){
      origin.bind(function(e){
        if(e.type === ev && listener[ev]) 
          listener[ev](e); 
      });
    });
  };
  
  var template = function(query) {
    return _.template($(query).text());
  };
  
  var getYearFromTimestamp = function(timestamp) {
    var d = new Date();
    d.setTime(timestamp * 1000);
    return d.getFullYear();
  };
  
  
  /*
    Models
  */
  // Stores state
  var Timeline = function(series) {
    this.bySid  = {};
    this.series = [];
    this.bounds = new Bounds();
    this.createSeries(series);
    this.bar      = new Bar(this);
    this.cardCont = new CardContainer(this);
    sync(this.bar, this.cardCont, "move", "zoom");
    var e = $.Event("render");
    this.trigger(e);
  };
  observable(Timeline.prototype);
  
  Timeline.prototype = _.extend(Timeline.prototype, {
    createSeries : function(series){
      for(var i = 0; i < series.length; i++){
        this.add(series[i]);
      }
    },
    
    add : function(card){
      if(!(card.event_series in this.bySid)){
        this.bySid[card.event_series] = new Series(card, this);
        this.series.push(this.bySid[card.event_series]);
      }
      var series = this.bySid[card.event_series];
      series.add(card);
      this.bounds.extend(series.max());
      this.bounds.extend(series.min());
    }
  });
  
  
  
  /*
   Views
  */
  var Bar = function(timeline) {
    this.el = $(".timeline_notchbar");
    this.el.css({ "left": 0 });
    this.timeline = timeline;
    draggable(this);
    wheel(this);
    _.bindAll(this, "moving", "doZoom");
    this.el.bind("dragging scrolled", this.moving);
    this.el.bind("doZoom", this.doZoom);
    this.template = template("#year_notch_tmpl");
    this.render();
  };
  observable(Bar.prototype);
  transformable(Bar.prototype);
  
  Bar.prototype = _.extend(Bar.prototype, {
    moving : function(e){
      var parent  = this.el.parent();
      var pOffset = parent.offset().left;
      var offset  = this.el.offset().left;
      
      // check to make sure we have a delta
      if(_.isUndefined(e.deltaX)) e.deltaX = 0;
      
      // check to make sure the bar isn't out of bounds
      if(offset + this.el.width() + e.deltaX < pOffset + parent.width())
        e.deltaX = (pOffset + parent.width()) - (offset + this.el.width());
      if(offset + e.deltaX > pOffset)
        e.deltaX = pOffset - offset;
        
      // and move both this and the card container.
      e.type = "move";
      this.trigger(e);
      this.move(e);
    },
    
    doZoom : function(e, width){
      var that = this;
      
      // needs fixin for offset and things, time fer thinkin'
      this.el.animate({"width": width + "%"}, {
        step: function(current) { 
          var e   = $.Event();
          e.width = current + "%";
          e.type  = "zoom";
          that.el.trigger("dragging");
          that.trigger(e);
        } 
      });
    },
    
    render : function(){
      var timestamp, year, html, date;
      var earliestYear = getYearFromTimestamp(this.timeline.bounds.min);
      var latestYear   = getYearFromTimestamp(this.timeline.bounds.max);
      // calculate divisions a bit better.
      for (i = earliestYear; i < latestYear; i++) {
        date      = new Date();
        date.setYear(i);
        date.setMonth(1);
        date.setDate(1);
        timestamp = date.getTime() / 1000 | 0;
        year      = i;
        html      = this.template({'timestamp' : timestamp, 'year' : year });
        this.el.append($(html).css("left", (this.timeline.bounds.project(timestamp, 100) | 0) + "%"));
      }
    }
  });
  
  
  
  var CardContainer = function(timeline){
    this.el = $("#timeline_card_scroller_inner");
  };
  observable(CardContainer.prototype);
  transformable(CardContainer.prototype);  
  
  var color = function(){
    return "#" + _.reduce([256, 182, 230], function(memo, it){
      var unpadded = (Math.random(it) * 256 | 0).toString(16);
      return memo + (unpadded.length < 2 ? "0" + unpadded : unpadded);
    }, "");
  };
  
  
  
  
  var Series = function(series, timeline) {
    this.color    = color();
    this.timeline = timeline;
    this.name     = series.event_series;
    this.cards    = [];
    _.bindAll(this, "render");
    this.template = template("#series_legend_tmpl");
    this.timeline.bind(this.render);
  };
  observable(Series.prototype);
  
  Series.prototype = _.extend(Series.prototype, {
    add : function(card){
      var crd = new Card(card, this);
      this.cards.splice(this.sortedIndex(crd), 0, crd);
    },
    
    sortedIndex : function(card){
      return _.sortedIndex(this.cards, card, this._comparator);
    },
    
    _comparator : function(crd){
      return crd.timestamp;
    },
    
    
    hideNotches : function(){
      _.each(this.cards, function(card){
        card.hideNotch();
      });
    },
    
    showNotches : function(){
      _.each(this.cards, function(card){
        card.showNotch();
      });
    },
    
    render : function(e){
      //if(!e.type === "render") return;
      /// render the little square
      //var that = this;
      //this.el.toggle(function(){
      //  $(this).addClass("series_legend_item_inactive");
      //  that.hideNotches();
      //}, function(){
      //  $(this).removeClass("series_legend_item_inactive");
      //  that.showNotches();
      //});
    }
    
  });
  
  _(["min", "max"]).each(function(key){
    Series.prototype[key] = function() {
      return _[key].call(_, this.cards, this._comparator).timestamp;
    };
  });
  
  
  var Card = function(card, series) {
    this.series = series;
    var card = _.clone(card);
    this.timestamp = card.timestamp;
    //delete card.timestamp;
    this.attributes = card;
    this.attributes.topcolor = series.color;
    this.template = template("#card_tmpl");
    this.ntemplate = template("#notch_tmpl");
    _.bindAll(this, "render", "activate");
    this.series.timeline.bind(this.render);
    this.series.bind(this.deactivate);
  };
  
  Card.prototype = _.extend(Card.prototype, {
    get : function(key){
      return this.attributes[key];
    },
    
    render : function(){
      this.offset = this.series.timeline.bounds.project(this.timestamp, 100);
      var html = this.ntemplate(this.attributes);
      this.notch = $(html).css({"left": this.offset + "%"});
      $(".timeline_notchbar").append(this.notch);
      this.notch.click(this.activate);
    },
    
    activate : function(e){
      this.hideActiveCard();
      
      // draw the actual card
      if (!this.el) {
        this.el = $(this.template(this.attributes));
        this.el.css({"left": this.offset + "%"});
        $("#timeline_card_scroller_inner").append(this.el);
      }
      this.el.show().addClass("card_active");
      console.log(this.el);
      this.notch.addClass("timeline_notch_active");
    },
    
    hideActiveCard : function() {
      $(".card_active").removeClass("card_active").hide();
      $(".timeline_notch_active").removeClass("timeline_notch_active");
    },
    
    hideNotch : function(){
      this.notch.hide();
      if(this.el) this.el.hide();
    },
    
    showNotch : function(){
      this.notch.show();
    }
    
  });
  
  var ctor = function(){}
  var inherits = function(child, parent){
    ctor.prototype  = parent.prototype;
    child.prototype = new ctor();
    child.prototype.constructor = child; 
  };
  
  var Control = function(direction){
    this.direction = direction;
    this.el = $(this.prefix + direction);
  };
  
  // Controls
  var Zoom = function(direction) {
    Control.apply(this, arguments);
  };
  inherits(Zoom, Control);
  
  Zoom.prototype = _.extend(Zoom.prototype, {
    prefix: "timeline_zoom_"
  });
  
  
  var Pan = function(direction) {
    Control.apply(this, arguments);
  };  
  inherits(Pan, Control);
  
  Pan.prototype = _.extend(Zoom.prototype, {
    prefix: "timeline_scrub_"
  });
  
  $(function(){
    window.timeline = new Timeline(timelineData);
    new Zoom("in");
    new Zoom("out");
    new Pan("left");
    new Pan("right");
  });
  
})(window, document);
