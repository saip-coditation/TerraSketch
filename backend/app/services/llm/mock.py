"""Zero-cost mock Terraform generator.

Used as an explicit provider (`LLM_PROVIDER=mock`) or as fallback when
an upstream provider hits quota limits.
"""

from __future__ import annotations

from app.db.schemas import ClaudeOutput


def _aws_files(environment: str) -> dict[str, str]:
    return {
        "providers.tf": """terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}
""",
        "variables.tf": f"""variable "region" {{
  type    = string
  default = "ap-south-1"
}}

variable "project_name" {{
  type    = string
  default = "terrasketch-{environment}"
}}

variable "instance_type" {{
  type    = string
  default = "t3.micro"
}}
""",
        "main.tf": """# Mock mode output: this is template Terraform for quick testing.
resource "aws_s3_bucket" "assets" {
  bucket = "${var.project_name}-assets"
}

resource "aws_instance" "app" {
  ami           = "ami-0f58b397bc5c1f2e8"
  instance_type = var.instance_type
  tags = {
    Name = "${var.project_name}-app"
  }
}
""",
        "outputs.tf": """output "bucket_name" {
  value = aws_s3_bucket.assets.bucket
}

output "instance_id" {
  value = aws_instance.app.id
}
""",
    }


def _azure_files(environment: str) -> dict[str, str]:
    return {
        "providers.tf": """terraform {
  required_version = ">= 1.5.0"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }
}

provider "azurerm" {
  features {}
}
""",
        "variables.tf": f"""variable "location" {{
  type    = string
  default = "Central India"
}}

variable "project_name" {{
  type    = string
  default = "terrasketch-{environment}"
}}
""",
        "main.tf": """# Mock mode output: this is template Terraform for quick testing.
resource "azurerm_resource_group" "rg" {
  name     = "${var.project_name}-rg"
  location = var.location
}

resource "azurerm_storage_account" "sa" {
  name                     = replace("${var.project_name}sa", "-", "")
  resource_group_name      = azurerm_resource_group.rg.name
  location                 = azurerm_resource_group.rg.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
}
""",
        "outputs.tf": """output "resource_group_name" {
  value = azurerm_resource_group.rg.name
}
""",
    }


def _gcp_files(environment: str) -> dict[str, str]:
    return {
        "providers.tf": """terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
""",
        "variables.tf": f"""variable "project_id" {{
  type    = string
  default = "my-gcp-project"
}}

variable "region" {{
  type    = string
  default = "asia-south1"
}}

variable "name_prefix" {{
  type    = string
  default = "terrasketch-{environment}"
}}
""",
        "main.tf": """# Mock mode output: this is template Terraform for quick testing.
resource "google_storage_bucket" "assets" {
  name          = "${var.name_prefix}-assets"
  location      = var.region
  force_destroy = true
}
""",
        "outputs.tf": """output "bucket_name" {
  value = google_storage_bucket.assets.name
}
""",
    }


def generate_terraform(
    *,
    cloud_provider: str,
    environment: str,
    input_type: str,
    text_description: str | None = None,
    image_base64: str | None = None,
    generation_hints: str | None = None,
) -> ClaudeOutput:
    cloud_provider = cloud_provider.lower().strip()
    files_by_provider = {
        "aws": _aws_files(environment),
        "azure": _azure_files(environment),
        "gcp": _gcp_files(environment),
    }
    files = files_by_provider.get(cloud_provider) or _aws_files(environment)
    assumptions = [
        "Generated in mock mode (no paid API call).",
        "Resources are scaffolding templates and should be customized before production use.",
    ]
    if input_type == "image":
        assumptions.append(
            "Diagram parsing is skipped in mock mode; structure is based on provider defaults."
        )
    elif text_description:
        assumptions.append("Text description is not semantically parsed in mock mode.")
    gh = (generation_hints or "").strip()
    if gh:
        assumptions.append(f"User hints recorded (mock mode does not apply them): {gh[:500]}")

    return ClaudeOutput(
        provider=cloud_provider if cloud_provider in ("aws", "azure", "gcp") else "aws",
        assumptions=assumptions,
        resources_identified=["network", "compute", "storage"],
        files=files,
        usage_instructions=(
            "Mock mode output: run terraform init, terraform validate, then adapt variables/resources "
            "to your real architecture before terraform apply."
        ),
    )
