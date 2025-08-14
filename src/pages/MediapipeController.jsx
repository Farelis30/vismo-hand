import React, { useEffect, useRef, useState } from "react";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { Circle, Hand, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function MediapipeController() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const handLandmarkerRef = useRef(null);
  const [webcamRunning, setWebcamRunning] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [lastDirection, setLastDirection] = useState("stop");
  const [fingerStates, setFingerStates] = useState([
    false,
    false,
    false,
    false,
    false,
  ]);
  const [currentGesture, setCurrentGesture] = useState("Tidak ada tangan");
  const requestAnimationRef = useRef(null);

  const ipESP8266 = "192.168.4.1";

  // Inisialisasi model MediaPipe
  useEffect(() => {
    const initializeModel = async () => {
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
        toast.success("Model berhasil dimuat");
      } catch (error) {
        console.error("Error loading model:", error);
        toast.error("Gagal memuat model");
      }
    };

    initializeModel();

    return () => {
      if (requestAnimationRef.current) {
        cancelAnimationFrame(requestAnimationRef.current);
      }
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks();
        tracks.forEach((track) => track.stop());
      }
    };
  }, []);

  // Deteksi status jari terbuka/tutup
  const getFingerStates = (landmarks) => {
    // ====== 1) DETEKSI JEMPOL ======
    // hitung jarak thumb_tip ke index_mcp vs thumb_ip ke index_mcp
    const thumbTipX = landmarks[4].x;
    const thumbIpX = landmarks[3].x;
    const indexMcpX = landmarks[5].x;

    // selisih jarak ke index_mcp
    const tipDist = Math.abs(thumbTipX - indexMcpX);
    const ipDist = Math.abs(thumbIpX - indexMcpX);

    // jempol dianggap terbuka kalau tip lebih jauh dari telapak
    const thumbOpen = tipDist > ipDist + 0.02; // margin supaya tidak terlalu sensitif

    // ====== 2) DETEKSI JARI LAIN (VERTIKAL) ======
    const fingerTips = [8, 12, 16, 20]; // telunjuk, tengah, manis, kelingking
    const fingerMcp = [5, 9, 13, 17];
    const fingersOpen = [];

    for (let i = 0; i < fingerTips.length; i++) {
      const tip = fingerTips[i];
      const mcp = fingerMcp[i];
      // jari terbuka jika tip lebih tinggi (y lebih kecil) dari mcp
      fingersOpen.push(landmarks[tip].y < landmarks[mcp].y - 0.02);
    }

    return [thumbOpen, ...fingersOpen];
  };

  // Klasifikasi gesture 4 kelas: Maju, Stop, Kiri, Kanan
  const classifyGesture = (states) => {
    // Semua jari terbuka
    if (states.every((state) => state)) {
      return "maju";
    }

    // Semua tertutup
    if (!states.some((state) => state)) {
      return "stop";
    }

    // Hanya jempol terbuka
    if (states[0] && !states.slice(1).some((state) => state)) {
      return "kiri";
    }

    // Hanya kelingking terbuka
    if (states[4] && !states.slice(0, 4).some((state) => state)) {
      return "kanan";
    }

    return "stop"; // default untuk gesture tidak dikenal
  };

  // Mengirim perintah ke ESP8266
  const sendCommand = (command) => {
    if (command === lastDirection) return; // Mencegah pengiriman berulang

    const url = `http://${ipESP8266}/car/${command}`;
    setLastDirection(command);

    fetch(url)
      .then((response) => {
        if (response.ok) {
          console.log(`Command ${command} executed successfully`);
        } else {
          console.error(
            `Error: ${command} failed with status ${response.status}`
          );
        }
      })
      .catch((error) => {
        console.error(`Fetch error: ${error}`);
      });
  };

  // Memulai webcam
  const startWebcam = async () => {
    if (!modelLoaded) {
      toast.error("Model belum dimuat, silakan tunggu");
      return;
    }

    try {
      const constraints = {
        video: { width: 640, height: 480 },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      videoRef.current.srcObject = stream;
      videoRef.current.addEventListener("loadeddata", predictWebcam);
      setWebcamRunning(true);
    } catch (error) {
      console.error("Error starting webcam:", error);
      toast.error("Gagal memulai webcam");
    }
  };

  // Menghentikan webcam
  const stopWebcam = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }

    if (requestAnimationRef.current) {
      cancelAnimationFrame(requestAnimationRef.current);
      requestAnimationRef.current = null;
    }

    setWebcamRunning(false);
    setCurrentGesture("Tidak ada tangan");
    setFingerStates([false, false, false, false, false]);
    sendCommand("stop");
  };

  // Fungsi untuk prediksi dan rendering webcam
  const predictWebcam = async () => {
    if (!handLandmarkerRef.current || !videoRef.current || !canvasRef.current) {
      requestAnimationRef.current = requestAnimationFrame(predictWebcam);
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    // Sesuaikan ukuran canvas dengan video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Jalankan deteksi jika video berjalan
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      const startTimeMs = performance.now();
      const results = handLandmarkerRef.current.detectForVideo(
        video,
        startTimeMs
      );

      // Gambar frame video ke canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      let gestureText = "Tidak ada tangan";
      let states = [false, false, false, false, false];

      // Gambar landmark jika ada tangan yang terdeteksi
      if (results.landmarks && results.landmarks.length > 0) {
        const landmarks = results.landmarks[0];

        // Gambar landmark dan koneksi
        drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {
          color: "#00FF00",
          lineWidth: 3,
        });
        drawLandmarks(ctx, landmarks, { color: "#FF0000", radius: 4 });

        // Deteksi status jari
        states = getFingerStates(landmarks);
        setFingerStates(states);

        // Klasifikasi gesture
        const gesture = classifyGesture(states);
        const gestureNames = {
          maju: "Maju",
          stop: "Stop",
          kiri: "Kiri",
          kanan: "Kanan",
        };
        gestureText = `Prediksi: ${gestureNames[gesture] || "Tidak dikenal"}`;
        setCurrentGesture(gestureText);

        // Kirim command
        sendCommand(gesture);

        // Tampilkan status jari
        const fingerNames = [
          "Jempol",
          "Telunjuk",
          "Tengah",
          "Manis",
          "Kelingking",
        ];
        const stateText = fingerNames
          .map((name, i) => `${name}: ${states[i] ? "Buka" : "Tutup"}`)
          .join(", ");

        // Background untuk teks
        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        ctx.fillRect(10, canvas.height - 80, canvas.width - 20, 70);

        // Teks status jari
        ctx.fillStyle = "#00FF00";
        ctx.font = "14px Arial";
        ctx.fillText(stateText, 15, canvas.height - 50);
      }

      // Tampilkan prediksi gesture
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.fillRect(10, 10, 300, 40);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "20px Arial";
      ctx.fillText(gestureText, 15, 35);
    }

    requestAnimationRef.current = requestAnimationFrame(predictWebcam);
  };

  // Fungsi untuk menggambar garis penghubung antara landmark
  const drawConnectors = (ctx, landmarks, connections, options) => {
    const { color = "#00FF00", lineWidth = 1 } = options || {};

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;

    for (const connection of connections) {
      const [start, end] = connection;
      if (landmarks[start] && landmarks[end]) {
        ctx.beginPath();
        ctx.moveTo(
          landmarks[start].x * ctx.canvas.width,
          landmarks[start].y * ctx.canvas.height
        );
        ctx.lineTo(
          landmarks[end].x * ctx.canvas.width,
          landmarks[end].y * ctx.canvas.height
        );
        ctx.stroke();
      }
    }
  };

  // Fungsi untuk menggambar landmark
  const drawLandmarks = (ctx, landmarks, options) => {
    const { color = "#FF0000", radius = 2 } = options || {};

    ctx.fillStyle = color;

    for (const landmark of landmarks) {
      ctx.beginPath();
      ctx.arc(
        landmark.x * ctx.canvas.width,
        landmark.y * ctx.canvas.height,
        radius,
        0,
        2 * Math.PI
      );
      ctx.fill();
    }
  };

  // Koneksi antar titik pada tangan
  const HAND_CONNECTIONS = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4], // jempol
    [0, 5],
    [5, 6],
    [6, 7],
    [7, 8], // telunjuk
    [0, 9],
    [9, 10],
    [10, 11],
    [11, 12], // jari tengah
    [0, 13],
    [13, 14],
    [14, 15],
    [15, 16], // jari manis
    [0, 17],
    [17, 18],
    [18, 19],
    [19, 20], // kelingking
    [5, 9],
    [9, 13],
    [13, 17],
    [0, 5],
    [0, 17], // telapak
  ];

  return (
    <div className="flex flex-col items-center space-y-6">
      <div className="relative w-full max-w-[640px] aspect-video bg-gray-100 rounded-lg overflow-hidden">
        <video
          ref={videoRef}
          className="absolute w-full h-full object-cover"
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
              <PlayCircle size={18} />
              Mulai Kamera
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
          <PlayCircle size={18} />
          Mulai
        </Button>

        <Button
          onClick={stopWebcam}
          disabled={!webcamRunning}
          variant="destructive"
          className="flex items-center gap-2"
        >
          <Circle size={18} />
          Berhenti
        </Button>
      </div>

      {/* Current Gesture Display */}
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
