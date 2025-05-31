import React from "react";
import { Outlet } from "react-router";
import { Toaster } from "sonner";

export default function AppLayout() {
  return (
    <div>
      <div className="min-h-screen flex items-center justify-center max-w-3xl mx-auto">
        <Outlet />
        <Toaster />
      </div>
    </div>
  );
}
