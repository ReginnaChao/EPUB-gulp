var gulp = require("gulp");
var fs = require("fs-extra");
var remove = require("remove");
var glob = require("glob");
var zlib = require("zlib");
var archiver = require("archiver");
var uuid = require("node-uuid");
var Handlebars = require("handlebars");

var cheerio = require('gulp-cheerio');			// Get Tag in file
var path = require('path');
var log = require('fancy-log'); //console.log

// Book Information
var bookInfo = {
	fileName: "替身新娘的貴族生活_TC_v1.0",	// 檔案名稱
	bookName: "替身新娘的貴族生活",			// 顯示的書名
	author: "夕鷺かのう",					// 作者
	lang: "zh"
}

// Configurations
var config = {
	source: "./src/",
	build: "./build/",
	target: "./target/",
	src: {
		xhtml: "./src/xhtml/",
		css: "./src/css/",
		js: "./src/js/",
		images: "./src/images/",
		templates: "./src/templates/"
	}
};

// Default performs a clean build
gulp.task("default", ["clean", "build"], function() {});

// Remove all build related files
gulp.task("clean", function() {
	if (fs.existsSync(config.build)) {
		remove.removeSync(config.build);
	}

	if (fs.existsSync(config.target)) {
		remove.removeSync(config.target);
	}
});

// Setup the build directory structure
gulp.task("prepare", ["clean"], function() {
	fs.mkdirSync(config.target);
	fs.mkdirSync(config.build);
	["META-INF", "css", "js", "xhtml", "images"].forEach(function(filePath) {
		fs.mkdirSync(config.build + filePath);
	});
});

// Get toc data
var titleObject = [];
var titleIndex = 0;
gulp.task('get_title', function () {
	var copy = function() {
		return function(filePath) {
			fs.copySync(config.source + filePath, config.build + filePath);
		
			return filePath;
		};
	};
	var trim = function(prefix) {
		return function(filePath) {
			return filePath.slice(prefix.length);
		};
	};
	var xhtml = glob.sync(config.src.xhtml + "**/*.xhtml");
	return gulp
	    // .src(['src/xhtml/**/*.xhtml'])
	    .src(xhtml)
	    .pipe(cheerio(function ($, file) {
	      var currentTitle = $('title').text();
	      var filePath = xhtml[titleIndex].split(config.src.xhtml)[1];
	      if(currentTitle == undefined) currentTitle = filePath;
	      log(filePath);
	      var data = {
	      	id: path.basename(filePath),
			path: filePath,
	      	title: currentTitle
	      }
	      titleObject.push(data);
	      titleIndex++
	}));
});

gulp.task("build", ["prepare", "get_title"], function() {
	var copy = function() {
		return function(filePath) {
			fs.copySync(config.source + filePath, config.build + filePath);
		
			return filePath;
		};
	};
	var trim = function(prefix) {
		return function(filePath) {
			return filePath.slice(prefix.length);
		};
	};

	// Move the EPUB source files into the build directory
	var css = glob.sync(config.src.css +  "**/*.css").map(trim(config.source)).map(copy());
	var js = glob.sync(config.src.js + "**/*.js").map(trim(config.source)).map(copy());
	var images = glob.sync(config.src.images + "**/*.*").map(trim(config.source)).map(copy());
	var xhtml = glob.sync(config.src.xhtml + "**/*.xhtml").map(trim(config.source)).map(copy());
	
	var mapper = function(filePath) {
		return {
			// id: "id_" + uuid.v4(),
			id: path.basename(filePath),
			path: filePath,
		};
	};
	var mapperImage = function(filePath) {
		var ext = path.extname(filePath);
        var base = path.basename(filePath, ext);
		var isCover = base.toLowerCase() == 'cover';
		return {
			id: path.basename(filePath),
			path: filePath,
			cover: isCover
		};
	};

	var publishDate = function(){
		// var d = ' '+ new Date();
		// Return: Tue Mar 13 2018 15:32:44 GMT+0800 (臺北標準時間)
		
		var d = new Date(),
			yyyy = d.getFullYear(),
			mm = ("0" + (d.getMonth() + 1)).slice(-2),
			dd = ("0" + d.getDate()).slice(-2),
			h = ("0" + d.getHours()).slice(-2),
			m = ("0" + d.getMinutes()).slice(-2);
		var date = yyyy + '-' + mm + '-' + dd + ' ' + h + ':' + m;
		return date
	}

	var packageData = {
		css: css.map(mapper),
		js: js.map(mapper),
		images: images.map(mapperImage),
		// Ensure ordering of spine items based on filename
		xhtml: xhtml.sort().map(mapper),

		// Book Information
		bookName: bookInfo.bookName,
		author: bookInfo.author,
		language: bookInfo.lang,
		date: publishDate
	};
	
	// var tableData = {
	// 	xhtml: xhtml.sort().map(trim("xhtml/")).map(mapper)
	// };
	var tableData = {
		xhtml: titleObject
	};
	
	// Compile and write the template files into the build directory
    [{ target: "META-INF/container.xml", template: "container.xml.handlebars", data: {} },
	 { target: "mimetype", template: "mimetype.handlebars", data: {} },
	 { target: "package.opf", template: "package.opf.handlebars", data: packageData },
	 { target: "xhtml/toc.xhtml", template: "toc.xhtml.handlebars", data: tableData }].forEach(function(template) {
	 	// Build toc Only function
	 	if(template.target == "xhtml/toc.xhtml"){}

		fs.writeFileSync(config.build + template.target, 
		Handlebars.compile(fs.readFileSync(config.src.templates + template.template).toString())(template.data));
	});

	// Write the contents of the build directory into the EPUB file
	var epub = archiver("zip", { zlib: { level: zlib.Z_NO_COMPRESSION } });
	epub.pipe(fs.createWriteStream(config.target + bookInfo.fileName + ".epub"));
	epub.bulk([{
		expand: true,
		cwd: "build",
		src: ["mimetype", "**/*"]
	}]);
	epub.finalize();
});

