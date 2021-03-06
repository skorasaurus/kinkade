/*jslint browser: true*/
/*global Tangram, gui */

//////
// Kinkade functionality
// Blame: Peter Richardson peter@mapzen.com
//


// export map object
map = (function () {
    'use strict';

    var map_start_location = [35.3470, 138.7379, 12.175]; // SF

    /*** URL parsing ***/

    // leaflet-style URL hash pattern:
    // #[zoom],[lat],[lng]
    var url_hash = window.location.hash.slice(1, window.location.hash.length).split('/');

    if (url_hash.length == 3) {
        map_start_location = [url_hash[1],url_hash[2], url_hash[0]];
        // convert from strings
        map_start_location = map_start_location.map(Number);
    }

    /*** Map ***/

    var map = L.map('map',
        {"keyboardZoomOffset" : .05}
    );

    var layer = Tangram.leafletLayer({
        scene: 'scene.yaml',
        attribution: '<a href="https://mapzen.com/tangram" target="_blank">Tangram</a> | &copy; OSM contributors | <a href="https://mapzen.com/" target="_blank">Mapzen</a>',
        preUpdate: preUpdate
    });

    window.layer = layer;
    var scene = layer.scene;
    window.scene = scene;

    // setView expects format ([lat, long], zoom)
    map.setView(map_start_location.slice(0, 3), map_start_location[2]);

    var hash = new L.Hash(map);

    /***** Render loop *****/

    window.addEventListener('load', function () {
        // Scene initialized
        layer.on('init', function() {
        });
        layer.addTo(map);
    });

    return map;

}());

// global variables
var kinkade = document.getElementById('kinkade');
var canvas = document.getElementById('kcanvas');
var ctx = canvas.getContext('2d');
var w = 10;
var radius = w/2;
var drawing = false;
var undos = [];

var x = 0;
var y = 0;
var lastX;
var lastY;
var colorHex = "ffffff";
var color = {r: 100, g: 100, b: 100};
var alpha = .1
var blurring = false;
var rotating = false;
var rewinding = false;

function updateColorHex(val) {
    resetFX();
    valRGB = hexToRgb(val);
    color = {r: valRGB.r, g: valRGB.g, b: valRGB.b};
    document.getElementById("picker").value = val;
}
function updateColorRGB(val) {
    resetFX();
    valRGB = val;
    color = val;
    setColor(RgbToHex(val))
}
function swatch(div) {
    val = getComputedStyle(div).backgroundColor.match(/^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
    val = {r: val[1], g: val[2], b: val[3]};
    updateColorRGB(val);
}
function setColor(val) {
    document.getElementById('picker').jscolor.fromString(val);
    updateColorHex(val);
}
function updateWidth(val) {
    resetFX();
    w = val;
}
function updateAlpha(val) {
    resetFX();
    alpha = val;
}
function switchBrush(which) {
    document.getElementById('brush1').className = "hitarea";
    document.getElementById('brush2').className = "hitarea";
    document.getElementById('brush3').className = "hitarea-fuzzy";
    which.className = "hitarea-selected";
}
function switchFuzzyBrush(which) {
    which.className = "hitarea-fuzzy-selected";
    document.getElementById('brush1').className = "hitarea";
    document.getElementById('brush2').className = "hitarea";
}
function updateScale(val) {
    scene.styles.hillshade.shaders.uniforms.u_scale = parseFloat(1/(Math.pow(2,val)-1));
    scene.requestRedraw();
    document.getElementById("scale").value = val;
}
function updateBlur(val) {
    if (document.getElementById('webcam').checked) {
        useWebcam(false);
    }
    if (!blurring) {
        blurring = true;
    }
    if (rotating) {
        resetRotate();
    }
    stackBlurImage( 'lastCanvas', 'kcanvas', val, false );
    scene.loadTextures();
    scene.requestRedraw();
}
function updateLines(val) {
    scene.config.global.lines = val;
    scene.updateConfig();
}
function updateLabels(val) {
    scene.config.global.labels = val;
    scene.updateConfig();
}
function updateOcean(val) {
    scene.config.global.water = val;
    scene.updateConfig();
}

function updateRotate(val) {
    if (document.getElementById('webcam').checked) useWebcam(false);
    val *= -1;
    if (!rotating) {
        rotating = true;
    }
    if (blurring) {
        saveCanvas(false, rotate, val);
        resetBlur();
    } else {
        rotate(val);
    }
}

// rotate the canvas
function rotate(val) {
    // get the last saved canvas
    if (!rewinding && !rotating) {
        lastCanvas.src = undos[undos.length - 1];
    } else {
        // saveCanvas();
        rewinding = false;
        rotating = true;
    }
    // transform the canvas - move so the rotate point is in the center of the image
    ctx.translate(canvas.width/2, canvas.height/2); 
    // rotate
    ctx.rotate(Math.PI/180*val);
    // move back to original position
    ctx.translate(-canvas.width/2, -canvas.height/2);
    // draw the saved image on the transformed canvas
    ctx.drawImage(lastCanvas, 0, 0); 
    // freeze current transform state
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // update map
    scene.loadTextures();
    scene.requestRedraw();

}

function resetFX(which) {
    if (which != 'webcam' && document.getElementById('webcam').checked) {
        useWebcam(false);
    }
    if (rotating || blurring) {
        saveCanvas();
    }
    if (rotating) resetRotate();
    if (blurring) resetBlur();
}

function resetRotate() {
    if (rotating) {
        saveCanvas();
        rotating = false;
        ctx.restore();
        document.getElementById('rotate').value = 0;
    }
}

// scrub levels of undo
function rewind(val) {
    rewinding = true;
    resetFX();
    lastCanvas.src = undos[val];
    lastCanvas.onload = function() {
        ctx.drawImage(lastCanvas, 0, 0);
        scene.loadTextures();
        lastCanvas.onload = null;
    };
}

function hexToRgb(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

function componentToHex(c) {
    var hex = parseInt(c).toString(16);
    return hex.length == 1 ? "0" + hex : hex;
}

function RgbToHex(val) {
    return componentToHex(val.r) + componentToHex(val.g) + componentToHex(val.b);
}

function draw(x,y,w,r,g,b,a){
        var gradient = ctx.createRadialGradient(x, y, 0, x, y, w);
        gradient.addColorStop(0, 'rgba('+r+', '+g+', '+b+', '+a+')');
        gradient.addColorStop(1, 'rgba('+r+', '+g+', '+b+', 0)');

        ctx.beginPath();
        ctx.arc(x, y, w, 0, 2 * Math.PI);
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.closePath();
};

function saveCanvas(overwrite, callback) {

    // save current state to undo history
    canvas.toBlob(function(blob, overwrite) {
        lastCanvas.src = URL.createObjectURL(blob);
        if (overwrite) {
            undos[undos.length] = lastCanvas.src;
            if (typeof callback != 'undefined') callback;
            // if (typeof callback != 'undefined') callback(arguments[arguments.length -1]);
        } else {
            undos.push(lastCanvas.src);
            updateRewindSlider();
            if (typeof callback != 'undefined') {
                callback(arguments[arguments.length-1]);
            }
            // if (typeof callback != 'undefined') callback(arguments[arguments.length -1]);
        }
    });
}

function resetBlur() {
    if (blurring) {
        blurring = false;
        document.getElementById('blur').value = 0;
    }
}

function updateRewindSlider() {
    if (undos.length > 1) {
        document.getElementById('rewind').disabled = false;
        percentWidth = (100. / Math.max(undos.length - 1, 1)) * .93;
        percentWidth = percentWidth < 2 ? 2 + (percentWidth % 1)/2 : percentWidth;
        rule = "#rewindwrapper { background-position: left; background-image: url('line.png'); background-size: "+percentWidth + "% 100%; background-position: top 0px left 10px; }";
        document.styleSheets[3].deleteRule(0);
        document.styleSheets[3].insertRule(rule, 0);

        document.getElementById('rewind').max = undos.length - 1;
        document.getElementById('rewind').value = undos.length - 1;
    }
}

function KeyPress(e) {
    var evtobj = window.event? event : e;
    // if ctrl-z, undo
    if (evtobj.which == 90 && evtobj.ctrlKey && !evtobj.shiftKey ||
        evtobj.which == 90 && evtobj.metaKey && !evtobj.shiftKey ) {
        rewindSlider.value -= 1;
        rewind(rewindSlider.value);
    // if ctrl-shift-z, redo
    } else if (evtobj.which == 90 && evtobj.ctrlKey && evtobj.shiftKey ||
        evtobj.which == 90 && evtobj.metaKey && evtobj.shiftKey ) {
        rewindSlider.value = parseInt(rewindSlider.value) + 1;
        rewind(rewindSlider.value);
    // if esc
    } else if (evtobj.which == 27) {
        hidePicker();
    // listen for "h"
    } else if (evtobj.which == 72 && document.activeElement != document.getElementsByClassName('leaflet-pelias-input')[0]) {
        // toggle UI
        var display = map._controlContainer.style.display;
        map._controlContainer.style.display = (display === "none") ? "block" : "none";
        display = kinkade.style.display;
        kinkade.style.display = (display === "none") ? "block" : "none";
        document.getElementById('panes').style.display = (display === "none") ? "block" : "none";
    }
}

// fill canvas with white
function clearCanvas() {
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "white";
    ctx.fill();
 }

function loadCanvas(dataurl) {
    blurring = false;
    rotating = false;
    clearCanvas();
    var img = new Image;
    img.onload = function(){
      ctx.drawImage(img,0,0,canvas.width,canvas.height);
      updateMap();
      saveCanvas();
    };
    img.src = dataurl;
 }

function updateMap(){
    scene.loadTextures();
}

// Dropzone used for drag-n-drop
var myDropzone;
Dropzone.options.canvaswrapper = {
    paramName: "file", // The name that will be used to transfer the file
    maxFilesize: 5, // MB
    accept: function(file, done) {
        return false; // prevents upload attempt
    },
    thumbnail: function(file, dataUrl) {
        // use Dropzone's thumbnail as the canvas image
        loadCanvas(dataUrl);

        var img = new Image;
        img.onload = function(){
            drawImgToCanvas(img);
        };
        img.src = dataUrl;

    },
    thumbnailWidth: 512,
    thumbnailHeight: 512,
    previewTemplate: document.getElementById('preview-template').innerHTML
};

function exportCanvas() {
    saveCanvas(false, function() {
        window.open(
          lastCanvas.src,
          '_blank' // <- This is what makes it open in a new window.
        );
    });
}

function useWebcam(start) { 
    if (start) {
        resetFX('webcam');
        Webcam.set({
            height: 256,
            width: 358
        });

        Webcam.attach( '#kvideo' );
        scene.updateConfig();
        document.getElementById("flipspan").style.color = '#000';
        document.getElementById("flipwebcam").disabled = false;
        document.getElementById("snapshot").disabled = false;
    }
    else {
        document.getElementById("webcam").checked = false;
        saveCanvas();
        Webcam.reset();
        document.getElementById("flipspan").style.color = '#aaa';
        document.getElementById("flipwebcam").disabled = true;
        document.getElementById("snapshot").disabled = true;
    }
}

function flipWebcam(active) {
    if (active) {
        canvas.style = 'transform:rotate(180deg)';
    } else {
        canvas.style = 'transform:rotate(0deg)';
    }
}

function preUpdate (will_render) {
    // Input
    if (document.getElementById('webcam').checked) {
        // video width = 358, canvas width = 256, difference = 51
        // half canvas width + difference = 179
        ctx.drawImage(document.querySelector('#kvideo > video'), -179, 0);
        if (typeof scene != 'undefined') scene.loadTextures();
    }
}

var video_capture = false;
var video_button = document.getElementById('recordvideo');
var video_blink = null;
// Take a video capture and save to file
function recordVideo() {
    if (!video_capture) {
        if (scene.startVideoCapture()) {
            video_capture = true;
            video_button.innerHTML = "STOP VIDEO";
            video_blink = setInterval(function() {
                var bgcolor = window.getComputedStyle( video_button ,null).getPropertyValue('background-color');
                // flash recording button
                video_button.style.backgroundColor = (bgcolor != "rgb(255, 192, 203)") ? "pink" : "white";
            }, 500);
        }
    }
    else {
        return scene.stopVideoCapture().then(function(video) {
            video_capture = false;
            video_button.innerHTML = "RECORD VIDEO";
            window.clearInterval(video_blink);
            video_button.style.backgroundColor = "white";
            saveAs(video.blob, 'tangram-video-' + (+new Date()) + '.webm');
        });
    }
};

if (typeof window.MediaRecorder == 'function') {
    // disable for now
    // video_button.style.display = "inline";
};

function togglePane(which, state) {
    // console.log('typeof state:', typeof state)
    if (typeof state != 'undefined') {
        document.getElementById(which).style.display = state == true? 'block' : 'none';
    } else {
        document.getElementById(which).style.display = document.getElementById(which).style.display != 'block' ? 'block' : 'none';
    }
    var panes = ["locations", "examples", "scenespane"];
    for (x in panes) {
        if (panes[x] != which) {
            // console.log('panes[x]:', panes[x])
            document.getElementById(panes[x]).style.display = 'none';
        }
    }
}

function swapimg(div) {
    img = div.childNodes[0];
    drawImgToCanvas(img);
    updateMap();
    saveCanvas();
}

function drawImgToCanvas(img) {
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
    var colorThief = new ColorThief();
    p = colorThief.getPalette(img, 8);
    swatches = document.getElementById('swatches').getElementsByClassName('swatch');
    for (var x = 0; x < p.length - 1; x++) {
        swatches[x].style.backgroundColor = 'rgb('+p[x][0]+', '+p[x][1]+', '+p[x][2]+')';
    }        
}

window.onload = function () {
    // set events
    canvas.onselectstart = function(){ return false; };
    canvas.onselectend = function(){ console.log('done'); };
    canvas.addEventListener("mousedown", function(e){
        resetFX();
        drawing = true;
        lastX = e.offsetX;
        lastY = e.offsetY;
        draw(lastX, lastY,w,color.r,color.g,color.b, alpha);
    });
    canvas.addEventListener("mouseup", function(){
        drawing = false;
        scene.loadTextures();
        saveCanvas();
    });

    // drawing function
    // based on http://stackoverflow.com/a/17359298/738675
    canvas.addEventListener("mousemove", function(e){
        if(drawing == true){
            x = e.offsetX;
            y = e.offsetY;
            // the distance the mouse has moved since last mousemove event
            var dis = Math.sqrt(Math.pow(lastX-x, 2)+Math.pow(lastY-y, 2));

            // for each pixel distance, draw a circle on the line connecting the two points
            // to get a continous line.
            for (i=0;i<dis;i+=1) {
                var s = i/dis;
                draw(lastX*s + x*(1-s), lastY*s + y*(1-s),w,color.r,color.g,color.b, alpha);
            }
            lastX = x;
            lastY = y;
            scene.loadTextures();
        };
    });

    updateColorHex(document.getElementById("picker").value);
    // updateWidth(document.getElementById("width").value);
    // updateAlpha(document.getElementById("alpha").value);

    // undo
    window.lastCanvas = document.getElementById("lastCanvas");
    window.prevCanvas = new Image;
    prevCanvas.id = "prevCanvas";
    window.rewindSlider = document.getElementById("rewind");

    // select fuzzy brush
    document.getElementById("brush3").click();

    // subscribe to Tangram's published view_complete event
    scene.subscribe({
        // trigger promise resolution
        view_complete: function () {
                // viewCompleteResolve();
            },
        warning: function(e) {
            }
    });
    document.onkeydown = KeyPress;
    // load dropzone
    window.myDropzone = new Dropzone("div#canvaswrapper", { url: "#"});
    // fill canvas with white
    clearCanvas();
    // init first undo
    saveCanvas();

    if (apiIsAccessible()) {
        showLoginButton();
        checkUser();
    }
}

function logout() {
    post('/api/developer/sign_out', null, checkLogout);
}

function showLoginButton() {
    document.getElementById("loginsection").style.display = "visible";
}

function checkLogout(response) {
    console.log('logged out:', response);
    getUser();
}