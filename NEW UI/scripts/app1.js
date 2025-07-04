window.addEventListener('DOMContentLoaded', function() {
  // Set up basic variables for app
  const record = document.querySelector(".record");
  const stop = document.querySelector(".stop");
  const soundClips = document.querySelector(".sound-clips");
  const canvas = document.querySelector(".visualizer");
  const mainSection = document.querySelector(".main-controls");

  // Disable stop button while not recording
  stop.disabled = true;

  // Visualiser setup - create web audio api context and canvas
  let audioCtx;
  const canvasCtx = canvas.getContext("2d");

  // --- User and Language Selection Logic ---
  const user1Lang = document.getElementById('user1-lang');
  const user2Lang = document.getElementById('user2-lang');
  let activeUser = 1;
  let userLanguages = { 1: 'en', 2: 'de' };

  const API_BASE_URL = 'https://svhbw2871pdm5w-5000.proxy.runpod.net';

  // Fetch available languages and populate dropdowns
  async function fetchLanguages() {
    // Fallback languages from personalities.py
    const fallbackLangs = {
      "af": "Afrikaans",
      "nl": "Dutch",
      "de": "German",
      "en": "English",
      "fr": "French",
      "es": "Spanish",
      "bg": "Bulgarian",
      "it": "Italian",
      "he": "Hebrew",
      "zh": "Chinese",
      "ja": "Japanese"
    };
    try {
      const res = await fetch(`${API_BASE_URL}/get_languages`);
      const data = await res.json();
      let langs = data.languages;
      if (!langs || Object.keys(langs).length === 0) {
        langs = fallbackLangs;
      }
      [user1Lang, user2Lang].forEach((dropdown, idx) => {
        dropdown.innerHTML = '';
        Object.entries(langs).forEach(([code, name]) => {
          const opt = document.createElement('option');
          opt.value = code;
          opt.textContent = name;
          dropdown.appendChild(opt);
        });
      });
      // Set defaults
      user1Lang.value = userLanguages[1];
      user2Lang.value = userLanguages[2];
    } catch (e) {
      // On error, use fallback
      [user1Lang, user2Lang].forEach((dropdown, idx) => {
        dropdown.innerHTML = '';
        Object.entries(fallbackLangs).forEach(([code, name]) => {
          const opt = document.createElement('option');
          opt.value = code;
          opt.textContent = name;
          dropdown.appendChild(opt);
        });
      });
      user1Lang.value = userLanguages[1];
      user2Lang.value = userLanguages[2];
      alert('Failed to fetch languages from server, using fallback list.');
    }
  }

  user1Lang.addEventListener('change', async () => {
    userLanguages[1] = user1Lang.value;
    await setUserLanguage(1, user1Lang.value);
  });
  user2Lang.addEventListener('change', async () => {
    userLanguages[2] = user2Lang.value;
    await setUserLanguage(2, user2Lang.value);
  });

  async function setUserLanguage(user, lang) {
    try {
      await fetch(`${API_BASE_URL}/set_user_language`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, language: lang })
      });
    } catch (e) {
      alert('Failed to set user language');
    }
  }

  fetchLanguages();
  // --- End User and Language Selection Logic ---

  // --- Dual User Recording Logic ---
  const recordBtns = [document.getElementById('record1'), document.getElementById('record2')];
  const stopBtns = [document.getElementById('stop1'), document.getElementById('stop2')];
  const visualizers = [document.getElementById('visualizer1'), document.getElementById('visualizer2')];
  const soundClipsAreas = [document.getElementById('sound-clips1'), document.getElementById('sound-clips2')];

  let mediaRecorders = [null, null];
  let streams = [null, null];
  let chunksArr = [[], []];

  // Disable both stop buttons initially
  stopBtns[0].disabled = true;
  stopBtns[1].disabled = true;

  // Helper to set up recording for a user (userIdx: 0 or 1)
  function setupRecorder(userIdx) {
    if (!navigator.mediaDevices.getUserMedia) {
      alert('MediaDevices.getUserMedia() not supported on your browser!');
      return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      streams[userIdx] = stream;
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorders[userIdx] = mediaRecorder;
      visualize(stream, visualizers[userIdx]);

      recordBtns[userIdx].onclick = function () {
        mediaRecorder.start();
        recordBtns[userIdx].style.background = 'red';
        stopBtns[userIdx].disabled = false;
        recordBtns[userIdx].disabled = true;
      };
      stopBtns[userIdx].onclick = function () {
        mediaRecorder.stop();
        recordBtns[userIdx].style.background = '';
        stopBtns[userIdx].disabled = true;
        recordBtns[userIdx].disabled = false;
      };
      mediaRecorder.ondataavailable = function (e) {
        chunksArr[userIdx].push(e.data);
      };
      mediaRecorder.onstop = function () {
        const clipName = prompt('Enter a name for your sound clip?', 'My unnamed clip');
        const clipContainer = document.createElement('article');
        const clipLabel = document.createElement('p');
        const audio = document.createElement('audio');
        const deleteButton = document.createElement('button');
        clipContainer.classList.add('clip');
        audio.setAttribute('controls', '');
        deleteButton.textContent = 'Delete';
        deleteButton.className = 'delete';
        clipLabel.textContent = clipName === null ? 'My unnamed clip' : clipName;
        clipContainer.appendChild(audio);
        clipContainer.appendChild(clipLabel);
        clipContainer.appendChild(deleteButton);
        soundClipsAreas[userIdx].appendChild(clipContainer);
        audio.controls = true;
        const blob = new Blob(chunksArr[userIdx], { type: mediaRecorder.mimeType });
        chunksArr[userIdx] = [];
        const audioURL = window.URL.createObjectURL(blob);
        audio.src = audioURL;
        // Send audio to /fullAI_whisper endpoint and play the response
        // userIdx 0 = user 1, userIdx 1 = user 2
        sendAudioToFullAIWhisper(blob, userLanguages[userIdx + 1], userIdx + 1, userIdx);
        deleteButton.onclick = function (e) {
          e.target.closest('.clip').remove();
        };
        clipLabel.onclick = function () {
          const existingName = clipLabel.textContent;
          const newClipName = prompt('Enter a new name for your sound clip?');
          clipLabel.textContent = newClipName === null ? existingName : newClipName;
        };
      };
    }, err => {
      alert('The following error occurred: ' + err);
    });
  }

  // Set up both recorders
  setupRecorder(0); // User 1
  setupRecorder(1); // User 2

  function visualize(stream, canvas) {
    let audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const canvasCtx = canvas.getContext('2d');
    const bufferLength = 2048;
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = bufferLength;
    const dataArray = new Uint8Array(bufferLength);
    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);
    draw();
    function draw() {
      const WIDTH = canvas.width;
      const HEIGHT = canvas.height;
      requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(dataArray);
      canvasCtx.fillStyle = 'rgb(200, 200, 200)';
      canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);
      canvasCtx.lineWidth = 2;
      canvasCtx.strokeStyle = 'rgb(0, 0, 0)';
      canvasCtx.beginPath();
      let sliceWidth = WIDTH * 1.0 / bufferLength;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        let v = dataArray[i] / 128.0;
        let y = v * HEIGHT / 2;
        if (i === 0) {
          canvasCtx.moveTo(x, y);
        } else {
          canvasCtx.lineTo(x, y);
        }
        x += sliceWidth;
      }
      canvasCtx.lineTo(canvas.width, canvas.height / 2);
      canvasCtx.stroke();
    }
  }

  // Update sendAudioToFullAIWhisper to accept userIdx for saving audio to correct column
  async function sendAudioToFullAIWhisper(audioBlob, language = "en", user = 1, userIdx = 0) {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.wav');
    try {
      const response = await fetch(`${API_BASE_URL}/fullAI_whisper?user=` + user, {
        method: 'POST',
        body: formData
      });
      if (!response.ok) {
        let errorMsg = 'Unknown error';
        try {
          const error = await response.json();
          errorMsg = error.error || errorMsg;
        } catch (e) {}
        alert('Error: ' + errorMsg);
        return;
      }
      // The response is an audio file (audio/wav)
      const audioData = await response.blob();
      const audioUrl = URL.createObjectURL(audioData);
      // Play the audio and also add to the opposite user's sound clips area
      const aiAudio = new Audio(audioUrl);
      aiAudio.play();
      // Save the translated audio to the opposite user's column
      const clipContainer = document.createElement('article');
      const clipLabel = document.createElement('p');
      const audio = document.createElement('audio');
      const deleteButton = document.createElement('button');
      clipContainer.classList.add('clip');
      audio.setAttribute('controls', '');
      deleteButton.textContent = 'Delete';
      deleteButton.className = 'delete';
      clipLabel.textContent = 'AI Translation';
      clipContainer.appendChild(audio);
      clipContainer.appendChild(clipLabel);
      clipContainer.appendChild(deleteButton);
      soundClipsAreas[1 - userIdx].appendChild(clipContainer);
      audio.controls = true;
      audio.src = audioUrl;
      deleteButton.onclick = function (e) {
        e.target.closest('.clip').remove();
      };
      clipLabel.onclick = function () {
        const existingName = clipLabel.textContent;
        const newClipName = prompt('Enter a new name for your sound clip?');
        clipLabel.textContent = newClipName === null ? existingName : newClipName;
      };
    } catch (err) {
      alert('Failed to send audio: ' + err);
    }
  }

  window.onresize = function () {
    canvas.width = mainSection.offsetWidth;
  };

  window.onresize();
});

