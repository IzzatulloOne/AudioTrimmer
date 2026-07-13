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
    """Тестируем успешную обрезку фейкового аудио-файла"""
    fake_file_content = b"ID3 fake audio data track content stream"
    fake_file = io.BytesIO(fake_file_content)
    
    with TestClient(app) as client:
        response = client.post(
            "/trim",
            files={"file": ("test.mp3", fake_file, "audio/mpeg")},
            data={"start_time": "00:00:01", "end_time": "00:00:05"}
        )
        assert response.status_code == 200
        assert response.headers["content-type"] == "audio/mpeg"
        assert "attachment; filename=\"trimmed_test.mp3\"" in response.headers["content-disposition"]


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