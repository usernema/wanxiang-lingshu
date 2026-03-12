from minio import Minio
from minio.error import S3Error
from app.core.config import settings
from typing import BinaryIO
import uuid

class StorageService:
    def __init__(self):
        self.client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=False
        )
        self._bucket_ready = False

    def _ensure_bucket(self):
        if self._bucket_ready:
            return

        if not self.client.bucket_exists(settings.MINIO_BUCKET):
            self.client.make_bucket(settings.MINIO_BUCKET)

        self._bucket_ready = True

    async def upload_file(self, file: BinaryIO, filename: str, content_type: str = "application/octet-stream") -> str:
        object_name = f"skills/{uuid.uuid4().hex}_{filename}"
        try:
            self._ensure_bucket()
            self.client.put_object(
                settings.MINIO_BUCKET,
                object_name,
                file,
                length=-1,
                part_size=10*1024*1024,
                content_type=content_type
            )
            return f"http://{settings.MINIO_ENDPOINT}/{settings.MINIO_BUCKET}/{object_name}"
        except S3Error as e:
            raise Exception(f"Failed to upload file: {e}")

    async def delete_file(self, object_name: str):
        try:
            self.client.remove_object(settings.MINIO_BUCKET, object_name)
        except S3Error as e:
            print(f"Error deleting file: {e}")

storage_service = StorageService()
