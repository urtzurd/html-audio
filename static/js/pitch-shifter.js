var pitchShifter = (function () {

    var audioContext,
        audioSources = [],
        pitchShifterProcessor,
        spectrumAudioAnalyser,
        sonogramAudioAnalyser,
        canvas,
        canvasContext,
        barGradient,
        waveGradient;

    var audioSourcesNames = ['MP3 file', 'Microphone'],
        audioSourceIndex = 0,
        audioVisualisationNames = ['Spectrum', 'Wave', 'Sonogram'],
        audioVisualisationIndex = 0,
        validGranSizes = [256, 512, 1024, 2048, 4096, 8192],
        grainSize = validGranSizes[1],
        pitchRatio = 1.0,
        overlapRatio = 0.50,
        spectrumFFTSize = 128,
        spectrumSmoothing = 0.8,
        sonogramFFTSize = 2048,
        sonogramSmoothing = 0;

    hannWindow = function (length) {

        var window = new Float32Array(length);
        for (var i = 0; i < length; i++) {
            window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (length - 1)));
        }
        return window;
    };

    linearInterpolation = function (a, b, t) {
        return a + (b - a) * t;
    };

    initAudio = function () {

        if (!navigator.getUserMedia) {

            alert('Your browser does not support the Media Stream API');

        } else {

            navigator.getUserMedia(

                {audio: true, video: false},

                function (stream) {
                    audioSources[1] = audioContext.createMediaStreamSource(stream);
                },

                function (error) {
                    alert('Unable to get the user media');
                }
            );
        }

        spectrumAudioAnalyser = audioContext.createAnalyser();
        spectrumAudioAnalyser.fftSize = spectrumFFTSize;
        spectrumAudioAnalyser.smoothingTimeConstant = spectrumSmoothing;

        sonogramAudioAnalyser = audioContext.createAnalyser();
        sonogramAudioAnalyser.fftSize = sonogramFFTSize;
        sonogramAudioAnalyser.smoothingTimeConstant = sonogramSmoothing;

        var bufferLoader = new BufferLoader(
            audioContext, ['audio/voice.mp3'], function (bufferList) {

                audioSources[0] = audioContext.createBufferSource();
                audioSources[0].buffer = bufferList[0];
                audioSources[0].loop = true;
                audioSources[0].connect(pitchShifterProcessor);
                audioSources[0].start(0);
            }
        );

        bufferLoader.load();
    };

    initProcessor = function () {

        if (pitchShifterProcessor) {
            pitchShifterProcessor.disconnect();
        }

        if (audioContext.createScriptProcessor) {
            pitchShifterProcessor = audioContext.createScriptProcessor(grainSize, 1, 1);
        } else if (audioContext.createJavaScriptNode) {
            pitchShifterProcessor = audioContext.createJavaScriptNode(grainSize, 1, 1);
        }

        pitchShifterProcessor.buffer = new Float32Array(grainSize * 2);
        pitchShifterProcessor.grainWindow = hannWindow(grainSize);
        pitchShifterProcessor.onaudioprocess = function (event) {

            var inputData = event.inputBuffer.getChannelData(0);
            var outputData = event.outputBuffer.getChannelData(0);

            for (i = 0; i < inputData.length; i++) {

                // Apply the window to the input buffer
                inputData[i] *= this.grainWindow[i];

                // Shift half of the buffer
                this.buffer[i] = this.buffer[i + grainSize];

                // Empty the buffer tail
                this.buffer[i + grainSize] = 0.0;
            }

            // Calculate the pitch shifted grain re-sampling and looping the input
            var grainData = new Float32Array(grainSize * 2);
            for (var i = 0, j = 0.0;
                 i < grainSize;
                 i++, j += pitchRatio) {

                var index = Math.floor(j) % grainSize;
                var a = inputData[index];
                var b = inputData[(index + 1) % grainSize];
                grainData[i] += linearInterpolation(a, b, j % 1.0) * this.grainWindow[i];
            }

            // Copy the grain multiple times overlapping it
            for (i = 0; i < grainSize; i += Math.round(grainSize * (1 - overlapRatio))) {
                for (j = 0; j <= grainSize; j++) {
                    this.buffer[i + j] += grainData[j];
                }
            }

            // Output the first half of the buffer
            for (i = 0; i < grainSize; i++) {
                outputData[i] = this.buffer[i];
            }
        };

        pitchShifterProcessor.connect(spectrumAudioAnalyser);
        pitchShifterProcessor.connect(sonogramAudioAnalyser);
        pitchShifterProcessor.connect(audioContext.destination);
    };

    initSliders = function () {

        $("#pitchRatioSlider").slider({
            orientation: "horizontal",
            min: 0.5,
            max: 2,
            step: 0.01,
            range: 'min',
            value: pitchRatio,
            slide: function (event, ui) {

                pitchRatio = ui.value;
                $("#pitchRatioDisplay").text(pitchRatio);
            }
        });

        $("#overlapRatioSlider").slider({
            orientation: "horizontal",
            min: 0,
            max: 0.75,
            step: 0.01,
            range: 'min',
            value: overlapRatio,
            slide: function (event, ui) {

                overlapRatio = ui.value;
                $("#overlapRatioDisplay").text(overlapRatio);
            }
        });

        $("#grainSizeSlider").slider({
            orientation: "horizontal",
            min: 0,
            max: validGranSizes.length - 1,
            step: 1,
            range: 'min',
            value: validGranSizes.indexOf(grainSize),
            slide: function (event, ui) {

                grainSize = validGranSizes[ui.value];
                $("#grainSizeDisplay").text(grainSize);

                initProcessor();

                if (audioSources[audioSourceIndex]) {
                    audioSources[audioSourceIndex].connect(pitchShifterProcessor);
                }
            }
        });

        $("#audioVisualisationSlider").slider({
            orientation: "horizontal",
            min: 0,
            max: audioVisualisationNames.length - 1,
            step: 1,
            value: audioVisualisationIndex,
            slide: function (event, ui) {

                audioVisualisationIndex = ui.value;
                $("#audioVisualisationDisplay").text(audioVisualisationNames[audioVisualisationIndex]);
            }
        });

        $("#audioSourceSlider").slider({
            orientation: "horizontal",
            min: 0,
            max: audioSourcesNames.length - 1,
            step: 1,
            value: audioSourceIndex,
            slide: function (event, ui) {

                if (audioSources[audioSourceIndex]) {
                    audioSources[audioSourceIndex].disconnect();
                }

                audioSourceIndex = ui.value;
                $("#audioSourceDisplay").text(audioSourcesNames[audioSourceIndex]);

                if (audioSources[audioSourceIndex]) {
                    audioSources[audioSourceIndex].connect(pitchShifterProcessor);
                }
            }
        });

        $("#pitchRatioDisplay").text(pitchRatio);
        $("#overlapRatioDisplay").text(overlapRatio);
        $("#grainSizeDisplay").text(grainSize);
        $("#audioVisualisationDisplay").text(audioVisualisationNames[audioVisualisationIndex]);
        $("#audioSourceDisplay").text(audioSourcesNames[audioSourceIndex]);
    };

    initCanvas = function () {

        canvas = document.querySelector('canvas');
        canvasContext = canvas.getContext('2d');

        barGradient = canvasContext.createLinearGradient(0, 0, 1, canvas.height - 1);
        barGradient.addColorStop(0, '#550000');
        barGradient.addColorStop(0.995, '#AA5555');
        barGradient.addColorStop(1, '#555555');

        waveGradient = canvasContext.createLinearGradient(canvas.width - 2, 0, canvas.width - 1, canvas.height - 1);
        waveGradient.addColorStop(0, '#FFFFFF');
        waveGradient.addColorStop(0.75, '#550000');
        waveGradient.addColorStop(0.75, '#555555');
        waveGradient.addColorStop(0.76, '#AA5555');
        waveGradient.addColorStop(1, '#FFFFFF');
    };

    renderCanvas = function () {

        switch (audioVisualisationIndex) {

            case 0:

                var frequencyData = new Uint8Array(spectrumAudioAnalyser.frequencyBinCount);
                spectrumAudioAnalyser.getByteFrequencyData(frequencyData);

                canvasContext.clearRect(0, 0, canvas.width, canvas.height);
                canvasContext.fillStyle = barGradient;

                var barWidth = canvas.width / frequencyData.length;
                for (i = 0; i < frequencyData.length; i++) {
                    var magnitude = frequencyData[i];
                    canvasContext.fillRect(barWidth * i, canvas.height, barWidth - 1, -magnitude - 1);
                }

                break;

            case 1:

                var timeData = new Uint8Array(spectrumAudioAnalyser.frequencyBinCount);
                spectrumAudioAnalyser.getByteTimeDomainData(timeData);
                var amplitude = 0.0;
                for (i = 0; i < timeData.length; i++) {
                    amplitude += timeData[i];
                }
                amplitude = Math.abs(amplitude / timeData.length - 128) * 5 + 1;

                var previousImage = canvasContext.getImageData(1, 0, canvas.width - 1, canvas.height);
                canvasContext.putImageData(previousImage, 0, 0);

                var axisY = canvas.height * 3 / 4;
                canvasContext.fillStyle = '#FFFFFF';
                canvasContext.fillRect(canvas.width - 1, 0, 1, canvas.height);
                canvasContext.fillStyle = waveGradient;
                canvasContext.fillRect(canvas.width - 1, axisY, 1, -amplitude);
                canvasContext.fillRect(canvas.width - 1, axisY, 1, amplitude / 2);

                break;

            case 2:

                frequencyData = new Uint8Array(sonogramAudioAnalyser.frequencyBinCount);
                sonogramAudioAnalyser.getByteFrequencyData(frequencyData);

                previousImage = canvasContext.getImageData(1, 0, canvas.width - 1, canvas.height);
                canvasContext.putImageData(previousImage, 0, 0);

                var bandHeight = canvas.height / frequencyData.length;
                for (var i = 0, y = canvas.height - 1;
                     i < frequencyData.length;
                     i++, y -= bandHeight) {

                    var color = frequencyData[i] << 16;
                    canvasContext.fillStyle = '#' + color.toString(16);
                    canvasContext.fillRect(canvas.width - 1, y, 1, -bandHeight);
                }

                break;
        }

        window.requestAnimFrame(renderCanvas);
    };

    return {

        init: function () {

            if ('AudioContext' in window) {
                audioContext = new AudioContext();
            } else {
                alert('Your browser does not support the Web Audio API');
                return;
            }

            initAudio();
            initProcessor();
            initSliders();
            initCanvas();

            window.requestAnimFrame(renderCanvas);
        }
    }

}());

window.requestAnimFrame = (function () {

    return (window.requestAnimationFrame ||
            window.webkitRequestAnimationFrame ||
            window.mozRequestAnimationFrame ||
            function (callback) {
                window.setTimeout(callback, 1000 / 60);
            });
})();

window.addEventListener("DOMContentLoaded", pitchShifter.init, true);
