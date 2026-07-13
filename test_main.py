import io
from fastapi.testclient import TestClient
from main import app

# Используем явную инициализацию через контекст или внутри функций
def test_read_index():
    """Тестируем, что главная страница отдается без ошибок"""
    with TestClient(app) as client:
        response = client.get("/")
        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]


def test_trim_media_success():
    """Тестируем успешную обрезку реального минимального аудио-файла"""
    # Валидный минимальный MP3 (1 секунда тишины)
    valid_mp3_bytes = bytes.fromhex(
        "fff344c40000000348000000004c414d45332e39382e3400000000000000000000000000"
        "000000000000000000000000000000000000000000000000000000000000000000000000"
    )
    fake_file = io.BytesIO(valid_mp3_bytes)

    with TestClient(app) as client:
        response = client.post(
            "/trim",
            files={"file": ("test.mp3", fake_file, "audio/mpeg")},
            data={"start_time": "00:00:00", "end_time": "00:00:01"}
        )
        assert response.status_code == 200

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