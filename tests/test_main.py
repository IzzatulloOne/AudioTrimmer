import io
from unittest.mock import patch
from fastapi.testclient import TestClient
from main import app

def test_read_index():
    """Тестируем, что главная страница отдается без ошибок"""
    with TestClient(app) as client:
        response = client.get("/")
        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]

def test_trim_media_success():
    """Тестируем эндпоинт /trim с моком ffmpeg"""
    fake_file = io.BytesIO(b"fake audio data")

    # Эта функция заменит реальный вызов subprocess.run
    def mock_ffmpeg(cmd, *args, **kwargs):
        output_path = cmd[-1] # Последний аргумент — путь сохранения
        with open(output_path, "wb") as f:
            f.write(b"trimmed content")

    # Подменяем subprocess.run внутри модуля
    with patch("subprocess.run", side_effect=mock_ffmpeg):
        with TestClient(app) as client:
            response = client.post(
                "/trim",
                files={"file": ("test.mp3", fake_file, "audio/mpeg")},
                data={"start_time": "00:00:00", "end_time": "00:00:01"}
            )
            
            assert response.status_code == 200
            assert response.content == b"trimmed content"

def test_trim_media_missing_parameters():
    """Тестируем обработку ошибки, если не переданы обязательные поля времени"""
    fake_file = io.BytesIO(b"fake data")
    
    with TestClient(app) as client:
        response = client.post(
            "/trim",
            files={"file": ("test.mp3", fake_file, "audio/mpeg")},
            data={}
        )
        assert response.status_code == 422