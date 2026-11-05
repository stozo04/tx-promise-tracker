(function ($) {
	/**
	 * initializeBlock
	 *
	 * Adds custom JavaScript to the block HTML.
	 *
	 * @param   object $block The block jQuery element.
	 * @param   object attributes The block attributes (only available when editing).
	 * @return  void
	 */
	const IsFront = $("body").hasClass("bricks-is-frontend");

	const initializeBlock = function ($block, $action, $editor) {
		let form = $block.hasClass("gdwp-forms")
			? $block
			: $block.find(".gdwp-forms");

		if (form.length) {

			let js = form.data("js");
			let hid = form.data("hid");

			//console.log( form.data() );
			//console.log( $block[0]);

			//reset js data
			$("script#" + hid).remove();

			if (js && $("script#" + hid).length == 0) {

				if ($editor && $action == "append") {
					form.find(".can_embed.v4.form").remove(); //AN
				}

				// if(form.hasClass('brxe-gd-bricks-gdwp-forms-ea') && window.nvtag){
				// 	delete window.nvtag;
				// 	console.log("delete nvtag");
				// }

				$("head").append(
					'<script id="' +
						hid +
						'" type="text/javascript" defer src="' +
						js +
						'"></script>'
				);
			}

			form.addClass('gdwp-initialized');
			
			console.log(form.attr('class'), 'init');
		}
	};

	const initForms = function () {
		let obj = $(".gdwp-forms:not(.gdwp-initialized)");

		//todo clean up interval in editor
		//todo fix AN js initialized
		
		if (obj.length > 0) {
			console.log("found form", obj.length);

			obj.each(function () {
				initializeBlock($(this));
			});
		}

		if (IsFront) {
			clearInterval(myInterval);
		}

		setTimeout(resetForm(), 1000);
	};

	const resetForm = function () {
		if (IsFront) {
			return;
		}

		let obj = $(".gdwp-forms.gdwp-initialized");
		if (obj.length > 0) {
			obj.each(function (i, e) {
				let _s = $(this);
				if (_s.children("div").html() == "") {

					if(_s.hasClass('brxe-gd-bricks-gdwp-forms-ea') && window.nvtag){
						delete window.nvtag;
						console.log("delete nvtag");
					}

					_s.removeClass("gdwp-initialized");
					console.log("form reset");
				} else {
					//console.log('html > ', obj[0], obj.children('div').html());
				}
			});
		}
	};

	const myInterval = setInterval(initForms, 2000);
	
	jQuery(function($){
		initForms();
	});
})(jQuery);
