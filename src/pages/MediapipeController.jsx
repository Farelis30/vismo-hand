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
  const requestAnimationRef = useRef(null);

  const ipESP32 = "192.168.4.1";

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
            numHands: 2,
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

  // Mengirim perintah ke ESP32
  const sendCommand = (command) => {
    if (command === lastDirection) return; // Mencegah pengiriman berulang

    const url = `http://${ipESP32}/car/${command}`;
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
    sendCommand("stop");
  };

  // Interpretasi hasil landmark tangan
  const interpretHandGesture = (results) => {
    if (!results || !results.landmarks || results.landmarks.length === 0) {
      return "stop";
    }

    // Untuk dua tangan
    if (results.landmarks.length === 2) {
      // Dapatkan posisi Y tengah (tinggi) dari masing-masing tangan
      const leftHandY = calculateHandCenterY(results.landmarks[0]);
      const rightHandY = calculateHandCenterY(results.landmarks[1]);

      // Tentukan tangan kiri dan kanan
      let leftHand, rightHand;

      // Penentuan tangan kiri dan kanan berdasarkan posisi X
      if (results.landmarks[0][0].x < results.landmarks[1][0].x) {
        leftHand = results.landmarks[0];
        rightHand = results.landmarks[1];
      } else {
        leftHand = results.landmarks[1];
        rightHand = results.landmarks[0];
      }

      // Jika tangan kanan lebih tinggi (nilai Y lebih kecil di canvas)
      if (rightHandY < leftHandY - 0.1) {
        return "kanan";
      }

      // Jika tangan kiri lebih tinggi
      if (leftHandY < rightHandY - 0.1) {
        return "kiri";
      }

      // Periksa jempol dan telunjuk untuk gerakan maju
      // Jempol: landmark 4, Telunjuk: landmark 8
      const thumbY = rightHand[4].y;
      const indexFingerY = rightHand[8].y;

      if (thumbY > indexFingerY + 0.1) {
        return "maju";
      }

      // Periksa jempol dan telunjuk untuk gerakan mundur
      // Jempol lebih tinggi dari telunjuk (Y lebih kecil)
      if (thumbY < indexFingerY - 0.1) {
        return "mundur";
      }

      // Jika tangan sejajar dan tidak ada gerakan khusus
      return "stop";
    } else {
      // Jika hanya ada satu tangan, kita bisa menggunakan gerakan lain
      const hand = results.landmarks[0];

      // Jempol: landmark 4, Telunjuk: landmark 8
      const thumbY = hand[4].y;
      const indexFingerY = hand[8].y;

      if (thumbY > indexFingerY + 0.1) {
        return "maju";
      }

      if (thumbY < indexFingerY - 0.1) {
        return "mundur";
      }

      return "stop";
    }
  };

  // Hitung posisi Y tengah dari tangan
  const calculateHandCenterY = (handLandmarks) => {
    let sum = 0;
    handLandmarks.forEach((landmark) => {
      sum += landmark.y;
    });
    return sum / handLandmarks.length;
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

      // Gambar landmark jika ada tangan yang terdeteksi
      if (results.landmarks) {
        for (const landmarks of results.landmarks) {
          drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {
            color: "#00FF00",
            lineWidth: 5,
          });
          drawLandmarks(ctx, landmarks, { color: "#FF0000", lineWidth: 2 });
        }

        // Interpretasi gerakan tangan
        const command = interpretHandGesture(results);
        sendCommand(command);

        // Tampilkan mode saat ini
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.fillRect(0, 0, 150, 40);
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "20px Arial";
        ctx.fillText(`Mode: ${command}`, 10, 30);
      }
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
    const { color = "#FF0000", lineWidth = 1 } = options || {};

    ctx.fillStyle = color;

    for (const landmark of landmarks) {
      ctx.beginPath();
      ctx.arc(
        landmark.x * ctx.canvas.width,
        landmark.y * ctx.canvas.height,
        lineWidth * 2,
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
    <div className="flex flex-col items-center">
      <div className="relative w-full max-w-[640px] aspect-video bg-gray-100 rounded-md overflow-hidden">
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
          <div className="absolute inset-0 flex flex-col items-center justify-center">
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

      <div className="mt-4 flex gap-4">
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

      <div className="mt-6 bg-gray-100 p-4 rounded-md w-full">
        <h3 className="font-semibold text-lg mb-2">Panduan Gerakan:</h3>
        <ul className="list-disc pl-5 space-y-2">
          <li>Tangan sejajar: Berhenti/idle</li>
          <li>Tangan kanan lebih tinggi: Belok kanan</li>
          <li>Tangan kiri lebih tinggi: Belok kiri</li>
          <li>Jempol di bawah telunjuk: Maju</li>
          <li>Jempol di atas telunjuk: Mundur</li>
        </ul>
      </div>
    </div>
  );
}
