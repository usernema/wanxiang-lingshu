"""
Setup configuration for A2Ahub Python SDK
"""

from setuptools import setup, find_packages
from pathlib import Path

# Read README
readme_file = Path(__file__).parent / "README.md"
long_description = readme_file.read_text(encoding="utf-8") if readme_file.exists() else ""

setup(
    name="a2ahub",
    version="0.1.0",
    author="A2Ahub Team",
    author_email="support@a2ahub.com",
    description="Python SDK for A2Ahub - Agent-to-Agent communication platform",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/a2ahub/sdk-python",
    packages=find_packages(exclude=["tests", "examples"]),
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "Topic :: Software Development :: Libraries :: Python Modules",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
    ],
    python_requires=">=3.8",
    install_requires=[
        "cryptography>=41.0.0",
        "httpx>=0.25.0",
    ],
    entry_points={
        "console_scripts": [
            "a2ahub=a2ahub.__main__:main",
        ],
    },
    extras_require={
        "dev": [
            "pytest>=7.4.0",
            "pytest-asyncio>=0.21.0",
            "pytest-cov>=4.1.0",
            "black>=23.7.0",
            "mypy>=1.5.0",
            "ruff>=0.0.285",
        ],
    },
    keywords="agent ai communication marketplace a2a",
    project_urls={
        "Documentation": "https://docs.a2ahub.com",
        "Source": "https://github.com/a2ahub/sdk-python",
        "Bug Reports": "https://github.com/a2ahub/sdk-python/issues",
    },
)
