
    (function() {
      if(!window['_DumpException']) {
        const _DumpException = window['_DumpException'] || function(e) {
          throw e;
        };
        window['_DumpException'] = _DumpException;
      }

      var _getCallbackFunction = function(name) {
        var segments = name.split('.');
        var w = window;
        for (var i = 0; i < segments.length; ++i) {
          if (!(w = w[segments[i]])) {
            return null;
          }
        }
        return w;
      };

      var _loadCss = function(url) {
        var link = document.createElement('link');
        link.type = 'text/css';
        link.rel = 'stylesheet';
        link.charset = 'UTF-8';
        link.href = url;
        document.head.appendChild(link);
      };

      var _loadJs = function(url) {
        var script = document.createElement('script');
        script.type = 'text/javascript';
        script.charset = 'UTF-8';
        script.src = url;
        document.head.appendChild(script);
      };

      var _isPlainObject = function(obj) {
        return !!obj &&
            (typeof obj === 'object' || typeof obj === 'function') &&
            typeof obj.nodeType !== 'number' &&
            !(window['Node'] && obj instanceof window['Node']);
      };

      var _setupNS = function(name) {
        var segments = name.split('.');
        var w = window;
        var hasOwn = Object.prototype.hasOwnProperty;
        for (var i = 0; i < segments.length; ++i) {
          var segment = segments[i];
          if (hasOwn.call(w, segment) && _isPlainObject(w[segment])) {
            w = w[segment];
          } else {
            w = w[segment] = {};
          }
        }
        return w;
      };

      // Create a function so variables do not leak into the global scope
      var initProtoFlow = function() {
  var configProto = JSON.parse('\x5b\x22en-US\x22,\x22googleTranslateElementInit\x22,\x5b0,1,0,\x5b\x22es_en\x22,\x22en_zh\x22,\x22en_de\x22,\x22en_ja\x22,\x22en_es\x22,\x22de_en\x22\x5d,null,\x5b0,3,100,\x5b\x22en_hi\x22,\x22en_it\x22,\x22en_ar\x22,\x22en_ru\x22,\x22en_de\x22,\x22en_zh\x22,\x22en_es\x22,\x22en_pt\x22,\x22en_fr\x22,\x22en_ko\x22,\x22en_ja\x22,\x22en_id\x22,\x22en_fa\x22,\x22en_pl\x22,\x22en_vi\x22,\x22en_tr\x22,\x22en_th\x22,\x22en_hu\x22,\x22en_ro\x22,\x22en_zh-hant\x22\x5d\x5d,1,1,0,\x5b\x22200%\x22,100\x5d\x5d,\x22\x22,\x22\x22,\x22prod\x22,\x22INFO\x22,null,\x22498379.791000369\x22,\x22translate.googleapis.com\x22,\x22translate-pa.googleapis.com\x22,null,\x22translate.googleapis.com\x22,\x22https:\/\/www.gstatic.com\/_\/translate_http\/_\/ss\/k\\u003dtranslate_http.tr.zZZZhVqDDCw.L.W.O\/am\\u003dAAAADA\/d\\u003d0\/rs\\u003dAN8SPfpM5SHGlT3x0dEbBnb5Xeruc5ptjw\/m\\u003del_main_css\x22,\x22translate-pa.googleapis.com\/v1\/supportedLanguages\x22,\x22translate.google.com\x22,0,null,null,null,\x22https:\/\/translate.googleapis.com\/_\/translate_http\/_\/js\/k\\u003dtranslate_http.tr.en_US.iSOfFrFUN-M.O\/am\\u003dAAAADA\/d\\u003d1\/ed\\u003d1\/rs\\u003dAN8SPfpFnQDgmqc0z_arb58NmV2VjP7q0g\/m\\u003del_main\x22,\x22TE_20261105\x22\x5d'); var translate = _setupNS('google.translate'); translate['_protoConfig'] = configProto;_loadCss('https:\/\/www.gstatic.com\/_\/translate_http\/_\/ss\/k\x3dtranslate_http.tr.zZZZhVqDDCw.L.W.O\/am\x3dAAAADA\/d\x3d0\/rs\x3dAN8SPfpM5SHGlT3x0dEbBnb5Xeruc5ptjw\/m\x3del_main_css'); _loadJs('https:\/\/translate.googleapis.com\/_\/translate_http\/_\/js\/k\x3dtranslate_http.tr.en_US.iSOfFrFUN-M.O\/am\x3dAAAADA\/d\x3d1\/ed\x3d1\/rs\x3dAN8SPfpFnQDgmqc0z_arb58NmV2VjP7q0g\/m\x3del_main');
      };

      initProtoFlow();
    })();
  