import React, { useEffect, useRef, useState } from "react";
import * as tf from "@tensorflow/tfjs";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { Circle, Hand, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

let model = null;
const CLASS_LABELS = ["maju", "kiri", "kanan", "stop"];

async function loadModel() {
  if (!model) {
    try {
      model = await tf.loadGraphModel("/tfjs_model_graph/model.json");
      console.log("✅ MobileNet loaded");
    } catch (error) {
      console.error("❌ Error loading MobileNet:", error);
    }
  }
  return model;
}

export default function GestureController() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const handLandmarkerRef = useRef(null);
  const [webcamRunning, setWebcamRunning] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [lastDirection, setLastDirection] = useState("stop");
  const [currentGesture, setCurrentGesture] = useState("Tidak ada tangan");
  const requestAnimationRef = useRef(null);
  const ipESP8266 = "192.168.4.1";

  // Load MobileNet & MediaPipe
  useEffect(() => {
    const init = async () => {
      await loadModel();
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        handLandmarkerRef.current = await HandLandmarker.createFromOptions(
          vision,
          {
            baseOptions: {
              modelAssetPath: "/src/model/hand_landmarker.task",
              delegate: "CPU",
            },
            numHands: 1,
            runningMode: "VIDEO",
          }
        );
        setModelLoaded(true);
        toast.success("Model siap digunakan");
      } catch (err) {
        console.error(err);
        toast.error("Gagal memuat MediaPipe");
      }
    };
    init();

    return () => {
      if (requestAnimationRef.current)
        cancelAnimationFrame(requestAnimationRef.current);
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const sendCommand = (command) => {
    if (command === lastDirection) return;
    fetch(`http://${ipESP8266}/car/${command}`)
      .then((res) => res.ok && console.log(`Command ${command}`))
      .catch(console.error);
    setLastDirection(command);
  };

  const startWebcam = async () => {
    if (!modelLoaded) {
      toast.error("Model belum siap");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
      });
      videoRef.current.srcObject = stream;
      videoRef.current.addEventListener("loadeddata", predictWebcam);
      setWebcamRunning(true);
    } catch (err) {
      console.error(err);
      toast.error("Gagal mengaktifkan webcam");
    }
  };

  const stopWebcam = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    if (requestAnimationRef.current)
      cancelAnimationFrame(requestAnimationRef.current);
    setWebcamRunning(false);
    setCurrentGesture("Tidak ada tangan");
    sendCommand("stop");
  };

  // Cek status jari
  const getFingerStates = (landmarks) => {
    const thumbOpen =
      Math.abs(landmarks[4].x - landmarks[5].x) >
      Math.abs(landmarks[3].x - landmarks[5].x) + 0.02;
    const fingerTips = [8, 12, 16, 20];
    const fingerMcp = [5, 9, 13, 17];
    const fingersOpen = fingerTips.map(
      (tip, i) => landmarks[tip].y < landmarks[fingerMcp[i]].y - 0.02
    );
    return [thumbOpen, ...fingersOpen];
  };

  const classifyGesture = (states, mobilePred = null) => {
    if (!states.some((v) => v)) return "stop"; // semua jari tertutup
    if (states[0] && !states.slice(1).some((v) => v)) return "kiri"; // jempol
    if (states[4] && !states.slice(0, 4).some((v) => v)) return "kanan"; // kelingking
    if (mobilePred) return mobilePred; // fallback MobileNet
    return "maju";
  };

  // Function to calculate bounding box from landmarks
  const getBoundingBox = (landmarks) => {
    const xCoords = landmarks.map((lm) => lm.x);
    const yCoords = landmarks.map((lm) => lm.y);

    const minX = Math.min(...xCoords);
    const maxX = Math.max(...xCoords);
    const minY = Math.min(...yCoords);
    const maxY = Math.max(...yCoords);

    // Add some padding to the bounding box
    const padding = 0.05;
    const width = maxX - minX;
    const height = maxY - minY;

    return {
      x: Math.max(0, minX - padding * width),
      y: Math.max(0, minY - padding * height),
      width: Math.min(
        1 - (minX - padding * width),
        width + 2 * padding * width
      ),
      height: Math.min(
        1 - (minY - padding * height),
        height + 2 * padding * height
      ),
    };
  };

  const preprocessTensor = (canvas) => {
    return tf.tidy(() => {
      let tensor = tf.browser.fromPixels(canvas);
      const resized = tf.image.resizeBilinear(tensor, [224, 224]);
      return resized.div(255.0).expandDims(0);
    });
  };

  const predictWebcam = async () => {
    if (!videoRef.current || !canvasRef.current || !handLandmarkerRef.current) {
      requestAnimationRef.current = requestAnimationFrame(predictWebcam);
      return;
    }
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    let states = [false, false, false, false, false];
    let mobilePredLabel = null;

    const results = handLandmarkerRef.current.detectForVideo(
      video,
      performance.now()
    );
    if (results.landmarks && results.landmarks.length > 0) {
      states = getFingerStates(results.landmarks[0]);

      // Draw bounding box instead of landmarks
      const bbox = getBoundingBox(results.landmarks[0]);
      const x = bbox.x * canvas.width;
      const y = bbox.y * canvas.height;
      const width = bbox.width * canvas.width;
      const height = bbox.height * canvas.height;

      // Draw bounding box
      ctx.strokeStyle = "#00FF00"; // Green color
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, width, height);

      // Add a label background
      ctx.fillStyle = "rgba(0, 255, 0, 0.8)";
      ctx.fillRect(x, y - 25, 100, 25);

      // Add text label
      ctx.fillStyle = "#000000";
      ctx.font = "16px Arial";
      ctx.fillText("Hand", x + 5, y - 8);
    }

    // MobileNet fallback jika jari tidak termasuk stop/kiri/kanan
    const inputTensor = preprocessTensor(canvas);
    if (model) {
      const prediction = model.predict(inputTensor);
      const data = await prediction.data();
      const maxIdx = data.indexOf(Math.max(...data));
      mobilePredLabel = CLASS_LABELS[maxIdx];
      inputTensor.dispose();
      prediction.dispose();
    }

    const gesture = classifyGesture(states, mobilePredLabel);
    setCurrentGesture(`Prediksi: ${gesture}`);
    sendCommand(gesture);

    requestAnimationRef.current = requestAnimationFrame(predictWebcam);
  };

  return (
    <div className="flex flex-col items-center space-y-6">
      <div className="relative w-full max-w-[640px] aspect-video bg-gray-100 rounded-lg overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          style={{ display: "none" }}
        />
        <canvas
          ref={canvasRef}
          className="absolute w-full h-full object-cover"
        />
        {!webcamRunning && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50">
            <Hand size={48} className="text-gray-400 mb-2" />
            <p className="text-gray-500 mb-4">
              {modelLoaded ? "Kamera tidak aktif" : "Memuat model..."}
            </p>
            <Button
              onClick={startWebcam}
              disabled={!modelLoaded}
              className="flex items-center gap-2"
            >
              <PlayCircle size={18} /> Mulai Kamera
            </Button>
          </div>
        )}
      </div>

      <div className="flex gap-4">
        <Button
          onClick={startWebcam}
          disabled={webcamRunning || !modelLoaded}
          variant="outline"
          className="flex items-center gap-2"
        >
          <PlayCircle size={18} /> Mulai
        </Button>
        <Button
          onClick={stopWebcam}
          disabled={!webcamRunning}
          variant="destructive"
          className="flex items-center gap-2"
        >
          <Circle size={18} /> Berhenti
        </Button>
      </div>

      {webcamRunning && (
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 w-full max-w-md text-center">
          <h3 className="font-semibold text-blue-800 mb-2">
            Gesture Saat Ini:
          </h3>
          <p className="text-xl font-bold text-blue-600">{currentGesture}</p>
        </div>
      )}
    </div>
  );
}
