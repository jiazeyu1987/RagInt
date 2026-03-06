import queue
import subprocess
import sys
import threading
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox, ttk


MODE_FLASH = "Flash ASR"
MODE_AUC = "AUC ASR"
MODE_SAUC = "1) SAUC WebSocket ASR"
MODE_DIALOG = "2) Realtime Dialogue WebSocket"
APP_KEY_OPTIONS = ["5843355819", "9030952134"]
ACCESS_KEY_OPTIONS = ["UQOb6ysCJectPRgE4ZcG4pGMv-CAY3w1", "r7xRR0BDZ8gke-AmRzD8Rcf-Mmip35Gc"]
DEFAULT_APP_KEY = APP_KEY_OPTIONS[0]
DEFAULT_ACCESS_KEY = ACCESS_KEY_OPTIONS[0]


class DoubaoAsrGui:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("Doubao ASR GUI")
        self.root.geometry("980x700")

        self.base_dir = Path(__file__).resolve().parent
        self.process: subprocess.Popen | None = None
        self.worker: threading.Thread | None = None
        self.log_queue: queue.Queue[str] = queue.Queue()

        self.mode_var = tk.StringVar(value=MODE_SAUC)
        self.app_key_var = tk.StringVar(value=DEFAULT_APP_KEY)
        self.access_key_var = tk.StringVar(value=DEFAULT_ACCESS_KEY)
        self.resource_id_var = tk.StringVar(value="volc.bigasr.auc_turbo")
        self.file_path_var = tk.StringVar()
        self.file_url_var = tk.StringVar()
        self.ws_url_var = tk.StringVar(value="wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream")
        self.seg_duration_var = tk.StringVar(value="200")
        self.dialog_format_var = tk.StringVar(value="pcm")
        self.dialog_recv_timeout_var = tk.StringVar(value="10")
        self.poll_interval_var = tk.StringVar(value="1.0")
        self.poll_timeout_var = tk.StringVar(value="300")
        self.output_var = tk.StringVar(value="result.json")
        self.hint_var = tk.StringVar()

        self._build_ui()
        self._on_mode_change()
        self.root.after(100, self._drain_log_queue)
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

    def _build_ui(self) -> None:
        frame = ttk.Frame(self.root, padding=12)
        frame.pack(fill=tk.BOTH, expand=True)

        row = 0
        ttk.Label(frame, text="Mode").grid(row=row, column=0, sticky=tk.W, pady=4)
        mode_box = ttk.Combobox(
            frame,
            textvariable=self.mode_var,
            values=[MODE_SAUC, MODE_DIALOG, MODE_FLASH, MODE_AUC],
            state="readonly",
            width=32,
        )
        mode_box.grid(row=row, column=1, columnspan=2, sticky=tk.EW, pady=4)
        mode_box.bind("<<ComboboxSelected>>", lambda _: self._on_mode_change())

        row += 1
        ttk.Label(frame, text="App ID (App Key)").grid(row=row, column=0, sticky=tk.W, pady=4)
        ttk.Combobox(
            frame,
            textvariable=self.app_key_var,
            values=APP_KEY_OPTIONS,
            state="readonly",
        ).grid(row=row, column=1, columnspan=2, sticky=tk.EW, pady=4)

        row += 1
        ttk.Label(frame, text="Access Key").grid(row=row, column=0, sticky=tk.W, pady=4)
        ttk.Combobox(
            frame,
            textvariable=self.access_key_var,
            values=ACCESS_KEY_OPTIONS,
            state="readonly",
        ).grid(row=row, column=1, columnspan=2, sticky=tk.EW, pady=4)

        row += 1
        ttk.Label(frame, text="Resource ID").grid(row=row, column=0, sticky=tk.W, pady=4)
        self.resource_entry = ttk.Entry(frame, textvariable=self.resource_id_var)
        self.resource_entry.grid(row=row, column=1, columnspan=2, sticky=tk.EW, pady=4)

        row += 1
        ttk.Label(frame, text="Local Audio File").grid(row=row, column=0, sticky=tk.W, pady=4)
        self.file_entry = ttk.Entry(frame, textvariable=self.file_path_var)
        self.file_entry.grid(row=row, column=1, sticky=tk.EW, pady=4)
        self.browse_btn = ttk.Button(frame, text="Browse", command=self._browse_file)
        self.browse_btn.grid(row=row, column=2, sticky=tk.E, pady=4)

        row += 1
        ttk.Label(frame, text="Audio URL").grid(row=row, column=0, sticky=tk.W, pady=4)
        self.url_entry = ttk.Entry(frame, textvariable=self.file_url_var)
        self.url_entry.grid(row=row, column=1, columnspan=2, sticky=tk.EW, pady=4)

        row += 1
        ttk.Label(frame, text="SAUC WebSocket URL").grid(row=row, column=0, sticky=tk.W, pady=4)
        self.ws_url_entry = ttk.Entry(frame, textvariable=self.ws_url_var)
        self.ws_url_entry.grid(row=row, column=1, columnspan=2, sticky=tk.EW, pady=4)

        row += 1
        ttk.Label(frame, text="SAUC Segment Duration (ms)").grid(row=row, column=0, sticky=tk.W, pady=4)
        self.seg_entry = ttk.Entry(frame, textvariable=self.seg_duration_var)
        self.seg_entry.grid(row=row, column=1, columnspan=2, sticky=tk.EW, pady=4)

        row += 1
        ttk.Label(frame, text="Dialog Output Format").grid(row=row, column=0, sticky=tk.W, pady=4)
        self.dialog_format_box = ttk.Combobox(
            frame,
            textvariable=self.dialog_format_var,
            values=["pcm", "pcm_s16le"],
            state="readonly",
        )
        self.dialog_format_box.grid(row=row, column=1, columnspan=2, sticky=tk.EW, pady=4)

        row += 1
        ttk.Label(frame, text="Dialog Recv Timeout (10-120s)").grid(row=row, column=0, sticky=tk.W, pady=4)
        self.dialog_recv_timeout_entry = ttk.Entry(frame, textvariable=self.dialog_recv_timeout_var)
        self.dialog_recv_timeout_entry.grid(row=row, column=1, columnspan=2, sticky=tk.EW, pady=4)

        row += 1
        ttk.Label(frame, text="AUC Poll Interval (s)").grid(row=row, column=0, sticky=tk.W, pady=4)
        self.poll_interval_entry = ttk.Entry(frame, textvariable=self.poll_interval_var)
        self.poll_interval_entry.grid(row=row, column=1, columnspan=2, sticky=tk.EW, pady=4)

        row += 1
        ttk.Label(frame, text="AUC Timeout (s)").grid(row=row, column=0, sticky=tk.W, pady=4)
        self.poll_timeout_entry = ttk.Entry(frame, textvariable=self.poll_timeout_var)
        self.poll_timeout_entry.grid(row=row, column=1, columnspan=2, sticky=tk.EW, pady=4)

        row += 1
        ttk.Label(frame, text="Result Output File").grid(row=row, column=0, sticky=tk.W, pady=4)
        self.output_entry = ttk.Entry(frame, textvariable=self.output_var)
        self.output_entry.grid(row=row, column=1, columnspan=2, sticky=tk.EW, pady=4)

        row += 1
        ttk.Label(frame, textvariable=self.hint_var, foreground="#2f5f9f").grid(
            row=row, column=0, columnspan=3, sticky=tk.W, pady=(4, 8)
        )

        row += 1
        button_frame = ttk.Frame(frame)
        button_frame.grid(row=row, column=0, columnspan=3, sticky=tk.W, pady=(0, 8))
        self.start_btn = ttk.Button(button_frame, text="Start", command=self._start)
        self.start_btn.pack(side=tk.LEFT, padx=(0, 8))
        self.stop_btn = ttk.Button(button_frame, text="Stop", command=self._stop, state=tk.DISABLED)
        self.stop_btn.pack(side=tk.LEFT)

        row += 1
        log_frame = ttk.Frame(frame)
        log_frame.grid(row=row, column=0, columnspan=3, sticky=tk.NSEW)
        self.log_text = tk.Text(log_frame, height=22, wrap=tk.WORD)
        self.log_text.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar = ttk.Scrollbar(log_frame, orient=tk.VERTICAL, command=self.log_text.yview)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.log_text.configure(yscrollcommand=scrollbar.set)

        frame.columnconfigure(1, weight=1)
        frame.rowconfigure(row, weight=1)

    def _on_mode_change(self) -> None:
        mode = self.mode_var.get()
        if mode == MODE_FLASH:
            self.resource_id_var.set("volc.bigasr.auc_turbo")
            self.output_var.set("result.json")
            self.hint_var.set("Flash: provide either local file or audio URL.")
            self._set_widget_state(self.file_entry, True)
            self._set_widget_state(self.browse_btn, True)
            self._set_widget_state(self.url_entry, True)
            self._set_widget_state(self.ws_url_entry, False)
            self._set_widget_state(self.seg_entry, False)
            self._set_widget_state(self.dialog_format_box, False)
            self._set_widget_state(self.dialog_recv_timeout_entry, False)
            self._set_widget_state(self.poll_interval_entry, False)
            self._set_widget_state(self.poll_timeout_entry, False)
            self._set_widget_state(self.output_entry, True)
        elif mode == MODE_AUC:
            self.resource_id_var.set("volc.bigasr.auc")
            self.output_var.set("auc_result.json")
            self.hint_var.set("AUC: audio URL is required; local file is ignored.")
            self._set_widget_state(self.file_entry, False)
            self._set_widget_state(self.browse_btn, False)
            self._set_widget_state(self.url_entry, True)
            self._set_widget_state(self.ws_url_entry, False)
            self._set_widget_state(self.seg_entry, False)
            self._set_widget_state(self.dialog_format_box, False)
            self._set_widget_state(self.dialog_recv_timeout_entry, False)
            self._set_widget_state(self.poll_interval_entry, True)
            self._set_widget_state(self.poll_timeout_entry, True)
            self._set_widget_state(self.output_entry, True)
        elif mode == MODE_SAUC:
            self.resource_id_var.set("volc.bigasr.sauc.duration")
            self.output_var.set("sauc_result.log")
            self.hint_var.set("Recommended #1: SAUC WebSocket ASR, local file required, ffmpeg must be installed.")
            self._set_widget_state(self.file_entry, True)
            self._set_widget_state(self.browse_btn, True)
            self._set_widget_state(self.url_entry, False)
            self._set_widget_state(self.ws_url_entry, True)
            self._set_widget_state(self.seg_entry, True)
            self._set_widget_state(self.dialog_format_box, False)
            self._set_widget_state(self.dialog_recv_timeout_entry, False)
            self._set_widget_state(self.poll_interval_entry, False)
            self._set_widget_state(self.poll_timeout_entry, False)
            self._set_widget_state(self.output_entry, False)
        else:
            self.output_var.set("dialog_result.log")
            self.hint_var.set("Recommended #2: realtime dialogue WebSocket. Leave Local Audio File empty for microphone.")
            self._set_widget_state(self.file_entry, True)
            self._set_widget_state(self.browse_btn, True)
            self._set_widget_state(self.url_entry, False)
            self._set_widget_state(self.ws_url_entry, False)
            self._set_widget_state(self.seg_entry, False)
            self._set_widget_state(self.dialog_format_box, True)
            self._set_widget_state(self.dialog_recv_timeout_entry, True)
            self._set_widget_state(self.poll_interval_entry, False)
            self._set_widget_state(self.poll_timeout_entry, False)
            self._set_widget_state(self.output_entry, False)
            self._set_widget_state(self.resource_entry, False)
            return

        self._set_widget_state(self.resource_entry, True)

    @staticmethod
    def _set_widget_state(widget: tk.Widget, enabled: bool) -> None:
        state = "normal" if enabled else "disabled"
        widget.configure(state=state)

    def _browse_file(self) -> None:
        path = filedialog.askopenfilename(
            title="Select audio file",
            filetypes=[("Audio", "*.wav *.mp3 *.m4a *.flac *.pcm"), ("All", "*.*")],
        )
        if path:
            self.file_path_var.set(path)

    def _start(self) -> None:
        if self.process and self.process.poll() is None:
            messagebox.showwarning("Warning", "A task is already running. Stop it first.")
            return

        try:
            command, cwd = self._build_command()
        except ValueError as exc:
            messagebox.showerror("Invalid Input", str(exc))
            return

        self.log_text.delete("1.0", tk.END)
        self._append_log(f"Command: {subprocess.list2cmdline(command)}")

        self.start_btn.configure(state=tk.DISABLED)
        self.stop_btn.configure(state=tk.NORMAL)
        self.worker = threading.Thread(target=self._run_process, args=(command, cwd), daemon=True)
        self.worker.start()

    def _build_command(self) -> tuple[list[str], Path]:
        app_key = self.app_key_var.get().strip()
        access_key = self.access_key_var.get().strip()
        resource_id = self.resource_id_var.get().strip()
        file_path = self.file_path_var.get().strip()
        file_url = self.file_url_var.get().strip()
        output_path = self.output_var.get().strip()

        if not app_key or not access_key:
            raise ValueError("App Key and Access Key are required.")

        mode = self.mode_var.get()
        if mode == MODE_FLASH:
            script = self.base_dir / "doubao" / "jisuban.py"
            if not file_path and not file_url:
                raise ValueError("Flash mode requires local file or URL.")
            command = [sys.executable, str(script), "--app-key", app_key, "--access-key", access_key]
            if resource_id:
                command.extend(["--resource-id", resource_id])
            if file_path:
                command.extend(["--file-path", file_path])
            else:
                command.extend(["--file-url", file_url])
            if output_path:
                command.extend(["--output", output_path])
            return command, script.parent

        if mode == MODE_AUC:
            script = self.base_dir / "doubao" / "biaozhunban" / "auc_python" / "auc_websocket_demo.py"
            if not file_url:
                raise ValueError("AUC mode requires audio URL.")
            command = [
                sys.executable,
                str(script),
                "--app-key",
                app_key,
                "--access-key",
                access_key,
                "--file-url",
                file_url,
            ]
            if resource_id:
                command.extend(["--resource-id", resource_id])
            poll_interval = self.poll_interval_var.get().strip()
            poll_timeout = self.poll_timeout_var.get().strip()
            if poll_interval:
                command.extend(["--poll-interval", poll_interval])
            if poll_timeout:
                command.extend(["--poll-timeout", poll_timeout])
            if output_path:
                command.extend(["--output", output_path])
            return command, script.parent

        if mode == MODE_DIALOG:
            script = self.base_dir / "doubao" / "duandaoduan" / "main.py"
            dialog_format = self.dialog_format_var.get().strip() or "pcm"
            recv_timeout = self.dialog_recv_timeout_var.get().strip() or "10"
            try:
                recv_timeout_int = int(recv_timeout)
            except ValueError as exc:
                raise ValueError("Dialog recv timeout must be an integer.") from exc
            if recv_timeout_int < 10 or recv_timeout_int > 120:
                raise ValueError("Dialog recv timeout must be in [10, 120].")
            command = [
                sys.executable,
                str(script),
                "--format",
                dialog_format,
                "--recv_timeout",
                str(recv_timeout_int),
                "--mod",
                "audio",
                "--app-id",
                app_key,
                "--access-key",
                access_key,
            ]
            if file_path:
                command.extend(["--audio", file_path])
            return command, script.parent

        script = self.base_dir / "doubao" / "liushiyuyin" / "sauc_websocket_demo.py"
        if not file_path:
            raise ValueError("SAUC mode requires local file path.")
        ws_url = self.ws_url_var.get().strip()
        if not ws_url:
            raise ValueError("SAUC WebSocket URL is required.")
        seg_duration = self.seg_duration_var.get().strip() or "200"
        command = [
            sys.executable,
            str(script),
            "--app-key",
            app_key,
            "--access-key",
            access_key,
            "--resource-id",
            resource_id,
            "--file",
            file_path,
            "--url",
            ws_url,
            "--seg-duration",
            seg_duration,
        ]
        return command, script.parent

    @staticmethod
    def _decode_output(raw: bytes) -> str:
        for enc in ("utf-8", "gb18030", "cp936"):
            try:
                return raw.decode(enc)
            except UnicodeDecodeError:
                continue
        return raw.decode(errors="replace")

    def _run_process(self, command: list[str], cwd: Path) -> None:
        try:
            self.process = subprocess.Popen(
                command,
                cwd=str(cwd),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=False,
            )
            assert self.process.stdout is not None
            for raw_line in self.process.stdout:
                line = self._decode_output(raw_line).rstrip("\r\n")
                self.log_queue.put(line)
            code = self.process.wait()
            self.log_queue.put(f"[Done] Exit code: {code}")
        except Exception as exc:
            self.log_queue.put(f"[Error] {exc}")
        finally:
            self.process = None
            self.log_queue.put("__PROCESS_DONE__")

    def _stop(self) -> None:
        if not self.process or self.process.poll() is not None:
            return
        self._append_log("Stopping task...")
        self.process.terminate()

    def _drain_log_queue(self) -> None:
        try:
            while True:
                line = self.log_queue.get_nowait()
                if line == "__PROCESS_DONE__":
                    self.start_btn.configure(state=tk.NORMAL)
                    self.stop_btn.configure(state=tk.DISABLED)
                else:
                    self._append_log(line)
        except queue.Empty:
            pass
        finally:
            self.root.after(100, self._drain_log_queue)

    def _append_log(self, message: str) -> None:
        self.log_text.insert(tk.END, message + "\n")
        self.log_text.see(tk.END)

    def _on_close(self) -> None:
        if self.process and self.process.poll() is None:
            if not messagebox.askyesno("Confirm", "Task is still running. Exit anyway?"):
                return
            self.process.terminate()
        self.root.destroy()


def main() -> None:
    root = tk.Tk()
    DoubaoAsrGui(root)
    root.mainloop()


if __name__ == "__main__":
    main()
