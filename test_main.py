import io
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_read_index():
    """Тестируем, что главная страница отдается без ошибок"""
    response = client.get("/")
    assert response.status_code == 200
    # Так как используется Jinja2Templates, проверяем, что в ответе HTML-текст
    assert "text/html" in response.headers["content-type"]


def test_trim_media_success():
    """Тестируем успешную обрезку фейкового аудио-файла"""
    # Создаем фейковый контент файла в памяти (имитируем аудио-файл)
    fake_file_content = b"ID3 fake audio data track content stream"
    fake_file = io.BytesIO(fake_file_content)
    
    # Формируем multipart/form-data запрос
    response = client.post(
        "/trim",
        files={"file": ("test.mp3", fake_file, "audio/mpeg")},
        data={"start_time": "00:00:01", "end_time": "00:00:05"}
    )
    
    # Ждем 200 OK, так как ffmpeg с флагом '-c copy' отработает даже на битом/пустом файле,
    # просто создав копию метаданных во временном файле.
    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/mpeg"
    assert "attachment; filename=\"trimmed_test.mp3\"" in response.headers["content-disposition"]


def test_trim_media_missing_parameters():
    """Тестируем обработку ошибки, если не переданы обязательные поля времени"""
    fake_file = io.BytesIO(b"fake data")
    
    # Отправляем файл, но забыли указать start_time и end_time
    response = client.post(
        "/trim",
        files={"file": ("test.mp3", fake_file, "audio/mpeg")},
        data={}  # Пустые данные формы
    )
    
    # FastAPI должен автоматически отдать 422 Unprocessable Entity (ошибка валидации)
    assert response.status_code == 422