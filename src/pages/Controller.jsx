import React, { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
} from "lucide-react";
import { toast } from "sonner";
import MediapipeController from "./MediapipeController";
import MobilenetController from "./MobilenetController";

export default function Controller() {
  const [pressedKey, setPressedKey] = useState(null);

  const handleKeyDown = (e) => {
    const key = e.key;
    if (
      ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(key)
    ) {
      e.preventDefault(); // mencegah scroll
      if (pressedKey !== key) {
        setPressedKey(key);
        switch (key) {
          case "ArrowUp":
            sendCommand(`http://${ipESP32}/car/maju`);
            break;
          case "ArrowDown":
            sendCommand(`http://${ipESP32}/car/mundur`);
            break;
          case "ArrowLeft":
            sendCommand(`http://${ipESP32}/car/kiri`);
            break;
          case "ArrowRight":
            sendCommand(`http://${ipESP32}/car/kanan`);
            break;
          case " ":
            sendCommand(`http://${ipESP32}/car/stop`);
            break;
          default:
            break;
        }
      }
    }
  };

  const handleKeyUp = (e) => {
    if (
      ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)
    ) {
      setPressedKey(null);
      sendCommand(`http://${ipESP32}/car/stop`);
    }
  };

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  const sendCommand = (url) => {
    fetch(url)
      .then((response) => {
        if (response.ok) {
          console.log(`${url} executed successfully`);
        } else {
          toast.error("Error sending command");
          console.error(`Error: ${url} failed with status ${response.status}`);
        }
      })
      .catch((error) => {
        toast.error("Error sending command");
        console.error(`Fetch error: ${error}`);
      });
  };

  const getButtonClass = (key) => {
    const isActive = pressedKey === key;
    return `cursor-pointer rounded-full w-16 h-16 text-white flex items-center justify-center transition-transform duration-75 ${
      isActive ? "bg-primary/80 scale-95" : "bg-primary hover:bg-primary/90"
    }`;
  };

  const ipESP32 = "192.168.4.1";

  return (
    <div className="p-6 bg-white rounded-2xl md:shadow-lg border border-gray-200">
      <Tabs defaultValue="controller" className="w-[400px]">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="controller" className="cursor-pointer">
            Controller
          </TabsTrigger>
          <TabsTrigger value="mediapipe" className="cursor-pointer">
            Mediapipe
          </TabsTrigger>
          <TabsTrigger value="mobilenet" className="cursor-pointer">
            MobileNetv2
          </TabsTrigger>
        </TabsList>
        <TabsContent value="controller">
          <Card>
            <CardHeader>
              <CardTitle>Controller</CardTitle>
              <CardDescription>
                Click the button to control the car robot
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-4 mb-6">
              <div></div>
              <div className="flex items-center justify-center">
                <button
                  className={getButtonClass("ArrowUp")}
                  onMouseDown={() => sendCommand(`http://${ipESP32}/car/maju`)}
                  onMouseUp={() => sendCommand(`http://${ipESP32}/car/stop`)}
                >
                  <ChevronUp className="w-[40px] h-[40px]" />
                </button>
              </div>
              <div></div>
              <div className="flex items-center justify-end">
                <button
                  className={getButtonClass("ArrowLeft")}
                  onMouseDown={() => sendCommand(`http://${ipESP32}/car/kiri`)}
                  onMouseUp={() => sendCommand(`http://${ipESP32}/car/stop`)}
                >
                  <ChevronLeft className="w-[40px] h-[40px]" />
                </button>
              </div>
              <div className="flex items-center justify-center">
                <button
                  className="cursor-pointer bg-primary/50 rounded-full w-16 h-16 text-white flex items-center justify-center"
                  disabled
                >
                  <Circle className="w-[30px] h-[30px]" />
                </button>
              </div>
              <div className="flex items-center justify-start">
                <button
                  className={getButtonClass("ArrowRight")}
                  onMouseDown={() => sendCommand(`http://${ipESP32}/car/kanan`)}
                  onMouseUp={() => sendCommand(`http://${ipESP32}/car/stop`)}
                >
                  <ChevronRight className="w-[40px] h-[40px]" />
                </button>
              </div>

              <div></div>
              <div className="flex items-center justify-center">
                <button
                  className={getButtonClass("ArrowDown")}
                  onMouseDown={() =>
                    sendCommand(`http://${ipESP32}/car/mundur`)
                  }
                  onMouseUp={() => sendCommand(`http://${ipESP32}/car/stop`)}
                >
                  <ChevronDown className="w-[40px] h-[40px]" />
                </button>
              </div>
              <div></div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="mediapipe">
          <Card>
            <CardHeader>
              <CardTitle>Mediapipe Controller</CardTitle>
              <CardDescription>
                Control the car robot using hand gesture mediapipe model
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MediapipeController />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="mobilenet">
          <Card>
            <CardHeader>
              <CardTitle>MobileNet Controller</CardTitle>
              <CardDescription>
                Control the car robot using hand gesture mobilenet v2 + SSD
                model
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MobilenetController />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
