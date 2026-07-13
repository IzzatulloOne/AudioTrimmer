import os
import subprocess
import tempfile
from fastapi import FastAPI, UploadFile, Form, Request
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
from starlette.background import BackgroundTasks

app = FastAPI()
templates = Jinja2Templates(directory="templates")

def remove_file(path: str):
    if os.path.exists(path):
        os.remove(path)

@app.get("/", response_class=HTMLResponse)
async def read_index(request: Request):
    # Явно передаем request в именованный параметр
    return templates.TemplateResponse(request=request, name="index.html")
    
@app.post("/trim")
async def trim_media(
    file: UploadFile,
    start_time: str = Form(...),
    end_time: str = Form(...),
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    ext = os.path.splitext(file.filename)[1]
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp_in:
        tmp_in.write(await file.read())
        input_path = tmp_in.name

    output_path = input_path.replace(ext, f"_trimmed{ext}")

    # -c copy работает и для аудио, и для видео без перекодирования
    cmd = [
        "ffmpeg", "-y",
        "-ss", start_time,
        "-to", end_time,
        "-i", input_path,
        "-c", "copy",
        output_path
    ]
    
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    background_tasks.add_task(remove_file, input_path)
    background_tasks.add_task(remove_file, output_path)

    return FileResponse(path=output_path, filename=f"trimmed_{file.filename}")