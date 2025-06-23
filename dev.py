#!/usr/bin/env python3
"""
Development server runner for DBT Timeline Visualization.
Starts both backend (Python FastAPI) and frontend (React Vite) servers.
"""
import subprocess
import sys
import signal
import os
import time
from pathlib import Path

def start_backend():
    """Start the Python FastAPI backend server"""
    print("🚀 Starting backend server (Python FastAPI)...")
    return subprocess.Popen(
        [sys.executable, "main.py"],
        cwd="backend",
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        universal_newlines=True,
        bufsize=1
    )

def start_frontend():
    """Start the React frontend development server"""
    print("🚀 Starting frontend server (React Vite)...")
    return subprocess.Popen(
        ["npm", "run", "dev"],
        cwd="frontend",
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        universal_newlines=True,
        bufsize=1
    )

def main():
    """Main function to start both servers concurrently"""
    print("🔧 Starting DBT Timeline Visualization development servers...\n")
    
    # Start both servers
    backend_proc = start_backend()
    time.sleep(2)  # Give backend time to start
    frontend_proc = start_frontend()
    
    # Print server information
    print("\n📍 Server Information:")
    print("   Frontend: http://localhost:3000")
    print("   Backend:  http://localhost:5000")
    print("   API Docs: http://localhost:5000/docs")
    print("\n⏹️  Press Ctrl+C to stop both servers\n")
    
    def signal_handler(sig, frame):
        print("\n🛑 Shutting down servers...")
        backend_proc.terminate()
        frontend_proc.terminate()
        backend_proc.wait()
        frontend_proc.wait()
        print("✅ Servers stopped successfully")
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    
    try:
        # Monitor both processes
        while True:
            # Check if processes are still running
            if backend_proc.poll() is not None:
                print("❌ Backend server stopped unexpectedly")
                break
            if frontend_proc.poll() is not None:
                print("❌ Frontend server stopped unexpectedly") 
                break
            time.sleep(1)
    except KeyboardInterrupt:
        signal_handler(signal.SIGINT, None)

if __name__ == "__main__":
    main()