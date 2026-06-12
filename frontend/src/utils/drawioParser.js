/**
 * Parser for Draw.io (.drawio/.xml) and Excalidraw (.excalidraw) files.
 *
 * Returns a plain-text architecture description that feeds into the existing
 * text generation pipeline — no backend changes needed.
 */

// ── Draw.io shape → human-readable service name ──────────────────────────────

const SHAPE_MAP = {
  // AWS (mxgraph.aws4.*)
  "aws4.ec2": "EC2 Instance",
  "aws4.ec2_instance": "EC2 Instance",
  "aws4.s3": "S3 Bucket",
  "aws4.s3_bucket": "S3 Bucket",
  "aws4.rds": "RDS Database",
  "aws4.aurora": "Aurora Database",
  "aws4.dynamodb": "DynamoDB Table",
  "aws4.lambda_function": "Lambda Function",
  "aws4.lambda": "Lambda Function",
  "aws4.api_gateway": "API Gateway",
  "aws4.cloudfront": "CloudFront Distribution",
  "aws4.elastic_load_balancing": "Application Load Balancer",
  "aws4.application_load_balancer": "Application Load Balancer",
  "aws4.network_load_balancer": "Network Load Balancer",
  "aws4.classic_load_balancer": "Classic Load Balancer",
  "aws4.vpc": "VPC",
  "aws4.virtual_private_cloud": "VPC",
  "aws4.internet_gateway": "Internet Gateway",
  "aws4.nat_gateway": "NAT Gateway",
  "aws4.subnet": "Subnet",
  "aws4.route_table": "Route Table",
  "aws4.security_group": "Security Group",
  "aws4.ecs": "ECS Cluster",
  "aws4.ecs_service": "ECS Service",
  "aws4.ecs_task": "ECS Task",
  "aws4.eks": "EKS Cluster",
  "aws4.fargate": "Fargate",
  "aws4.elasticache": "ElastiCache",
  "aws4.sqs": "SQS Queue",
  "aws4.sns": "SNS Topic",
  "aws4.cloudwatch": "CloudWatch",
  "aws4.iam": "IAM",
  "aws4.iam_role": "IAM Role",
  "aws4.secrets_manager": "Secrets Manager",
  "aws4.route_53": "Route 53",
  "aws4.cognito": "Cognito",
  "aws4.kinesis": "Kinesis",
  "aws4.glue": "Glue",
  "aws4.redshift": "Redshift",
  "aws4.waf": "WAF",
  "aws4.shield": "Shield",
  "aws4.cloudtrail": "CloudTrail",
  "aws4.codecommit": "CodeCommit",
  "aws4.codepipeline": "CodePipeline",
  "aws4.codedeploy": "CodeDeploy",
  "aws4.elastic_beanstalk": "Elastic Beanstalk",
  "aws4.step_functions": "Step Functions",
  "aws4.eventbridge": "EventBridge",
  "aws4.appsync": "AppSync",
  "aws4.opensearch": "OpenSearch",
  "aws4.elasticsearch": "Elasticsearch",
  "aws4.mq": "Amazon MQ",
  "aws4.certificate_manager": "ACM",
  "aws4.cloudformation": "CloudFormation",
  // Azure (mxgraph.azure.*)
  "azure.virtual_machine": "Azure VM",
  "azure.vm": "Azure VM",
  "azure.app_service": "App Service",
  "azure.aks": "AKS",
  "azure.kubernetes_service": "AKS",
  "azure.sql_database": "Azure SQL Database",
  "azure.sql_managed_instance": "SQL Managed Instance",
  "azure.cosmos_db": "Cosmos DB",
  "azure.storage": "Azure Storage",
  "azure.storage_account": "Storage Account",
  "azure.blob_storage": "Blob Storage",
  "azure.application_gateway": "Application Gateway",
  "azure.load_balancer": "Azure Load Balancer",
  "azure.virtual_network": "Virtual Network",
  "azure.subnet": "Azure Subnet",
  "azure.key_vault": "Key Vault",
  "azure.function": "Azure Functions",
  "azure.function_app": "Azure Functions",
  "azure.service_bus": "Service Bus",
  "azure.event_hub": "Event Hub",
  "azure.event_grid": "Event Grid",
  "azure.api_management": "API Management",
  "azure.cdn": "Azure CDN",
  "azure.frontdoor": "Front Door",
  "azure.container_instance": "Container Instance",
  "azure.container_registry": "Container Registry",
  "azure.redis_cache": "Azure Cache for Redis",
  "azure.monitor": "Azure Monitor",
  "azure.active_directory": "Azure AD",
  // GCP (mxgraph.gcp2.*)
  "gcp2.compute_engine": "Compute Engine",
  "gcp2.gke": "GKE",
  "gcp2.kubernetes_engine": "GKE",
  "gcp2.cloud_run": "Cloud Run",
  "gcp2.cloud_sql": "Cloud SQL",
  "gcp2.firestore": "Firestore",
  "gcp2.bigtable": "Bigtable",
  "gcp2.bigquery": "BigQuery",
  "gcp2.gcs": "Cloud Storage",
  "gcp2.cloud_storage": "Cloud Storage",
  "gcp2.cloud_load_balancing": "Cloud Load Balancer",
  "gcp2.cloud_functions": "Cloud Functions",
  "gcp2.pub_sub": "Pub/Sub",
  "gcp2.vpc_network": "VPC Network",
  "gcp2.cloud_armor": "Cloud Armor",
  "gcp2.secret_manager": "Secret Manager",
  "gcp2.cloud_cdn": "Cloud CDN",
  "gcp2.cloud_dns": "Cloud DNS",
  "gcp2.memorystore": "Memorystore",
  "gcp2.spanner": "Spanner",
  "gcp2.dataflow": "Dataflow",
  "gcp2.cloud_endpoints": "Cloud Endpoints",
};

function keyToReadable(key) {
  const service = key.split(".").pop();
  return service.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function styleToServiceName(style) {
  if (!style) return null;
  // resIcon= wins (used in newer AWS icon sheets)
  const resIcon = style.match(/resIcon=mxgraph\.([^;,\s]+)/);
  if (resIcon) {
    const k = resIcon[1];
    return SHAPE_MAP[k] ?? (k.startsWith("aws4.") || k.startsWith("azure.") || k.startsWith("gcp2.") ? keyToReadable(k) : null);
  }
  const shape = style.match(/shape=mxgraph\.([^;,\s]+)/);
  if (shape) {
    const k = shape[1];
    return SHAPE_MAP[k] ?? (k.startsWith("aws4.") || k.startsWith("azure.") || k.startsWith("gcp2.") ? keyToReadable(k) : null);
  }
  return null;
}

function detectProviderFromStyles(styles) {
  let aws = 0, azure = 0, gcp = 0;
  for (const s of styles) {
    if (/aws4\./i.test(s)) aws++;
    if (/azure\./i.test(s)) azure++;
    if (/gcp2\./i.test(s)) gcp++;
  }
  if (aws > azure && aws > gcp) return "aws";
  if (azure > aws && azure > gcp) return "azure";
  if (gcp > aws && gcp > azure) return "gcp";
  return null;
}

// ── Compressed draw.io decompression ─────────────────────────────────────────

async function tryDecompressDrawio(content) {
  // draw.io encodes diagram content as: encodeURIComponent(base64(deflate-raw(xml)))
  try {
    const urlDecoded = decodeURIComponent(content.trim());
    const binaryStr = atob(urlDecoded);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    const ds = new DecompressionStream("deflate-raw");
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();
    writer.write(bytes);
    writer.close();
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const total = chunks.reduce((s, c) => s + c.length, 0);
    const result = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { result.set(c, off); off += c.length; }
    return new TextDecoder().decode(result);
  } catch {
    return null;
  }
}

// ── Main Draw.io parser ───────────────────────────────────────────────────────

export async function parseDrawio(xmlString) {
  const domParser = new DOMParser();
  let doc = domParser.parseFromString(xmlString, "application/xml");

  if (doc.querySelector("parsererror")) {
    throw new Error("Invalid XML in draw.io file.");
  }

  // Handle <mxfile><diagram>...</diagram></mxfile> wrapper
  const diagramEl = doc.querySelector("diagram");
  if (diagramEl) {
    let innerContent = diagramEl.textContent?.trim() ?? "";
    // If the inner content looks like compressed XML (no < character), try to decompress
    if (innerContent && !innerContent.includes("<")) {
      const decompressed = await tryDecompressDrawio(innerContent);
      if (!decompressed) {
        throw new Error(
          "This draw.io file uses compressed storage. Please re-export it as Uncompressed XML:\n" +
          "In draw.io → File → Export As → XML → uncheck \"Compressed\" → Export."
        );
      }
      innerContent = decompressed;
    }
    if (innerContent) {
      doc = domParser.parseFromString(innerContent, "application/xml");
      if (doc.querySelector("parsererror")) {
        throw new Error("Could not parse the diagram content inside the draw.io file.");
      }
    }
  }

  const allCells = Array.from(doc.querySelectorAll("mxCell"));
  const vertices = allCells.filter((c) => c.getAttribute("vertex") === "1");
  const edges = allCells.filter((c) => c.getAttribute("edge") === "1");

  // Build id→shape map
  const shapeById = new Map();
  const shapes = [];
  for (const cell of vertices) {
    const id = cell.getAttribute("id");
    if (id === "0" || id === "1") continue;
    const label = (cell.getAttribute("value") || "").trim();
    const style = cell.getAttribute("style") || "";
    const serviceName = styleToServiceName(style) || (label || null);
    if (!serviceName) continue;

    const shape = { id, label, serviceName };
    shapes.push(shape);
    shapeById.set(id, shape);
  }

  // Connections
  const connections = [];
  for (const edge of edges) {
    const srcId = edge.getAttribute("source");
    const tgtId = edge.getAttribute("target");
    if (!srcId || !tgtId) continue;
    const src = shapeById.get(srcId);
    const tgt = shapeById.get(tgtId);
    if (src && tgt) {
      const edgeLabel = (edge.getAttribute("value") || "").trim();
      connections.push({ from: src, to: tgt, label: edgeLabel });
    }
  }

  // Provider from styles
  const styles = allCells.map((c) => c.getAttribute("style") || "");
  const provider = detectProviderFromStyles(styles);

  return { provider, shapes, connections };
}

// ── Excalidraw parser ─────────────────────────────────────────────────────────

export function parseExcalidraw(jsonString) {
  let data;
  try {
    data = JSON.parse(jsonString);
  } catch {
    throw new Error("Invalid JSON in Excalidraw file.");
  }
  if (!Array.isArray(data?.elements)) {
    throw new Error("Excalidraw file has no elements array.");
  }

  const elements = data.elements;
  const byId = Object.fromEntries(elements.map((el) => [el.id, el]));

  const shapeTypes = new Set(["rectangle", "ellipse", "diamond"]);
  const shapes = elements.filter((el) => shapeTypes.has(el.type) && !el.isDeleted);
  const texts = elements.filter((el) => el.type === "text" && !el.isDeleted && el.text?.trim());
  const arrows = elements.filter((el) => el.type === "arrow" && !el.isDeleted);

  // Associate each shape with its label
  const labeledShapes = shapes.map((shape) => {
    // Check boundElements for an attached text
    let label = "";
    if (Array.isArray(shape.boundElements)) {
      for (const b of shape.boundElements) {
        if (b.type === "text" && byId[b.id]?.text?.trim()) {
          label = byId[b.id].text.trim();
          break;
        }
      }
    }
    // Fall back to text overlapping the shape bounding box
    if (!label) {
      for (const t of texts) {
        if (
          t.x >= shape.x - 5 && t.x <= shape.x + (shape.width ?? 100) + 5 &&
          t.y >= shape.y - 5 && t.y <= shape.y + (shape.height ?? 60) + 5
        ) {
          label = t.text.trim();
          break;
        }
      }
    }
    return { id: shape.id, label: label || "Component", serviceName: label || "Component" };
  });

  const shapeByIdMap = Object.fromEntries(labeledShapes.map((s) => [s.id, s]));

  const connections = [];
  for (const arrow of arrows) {
    const srcEl = arrow.startBinding ? byId[arrow.startBinding.elementId] : null;
    const tgtEl = arrow.endBinding ? byId[arrow.endBinding.elementId] : null;
    const src = srcEl ? shapeByIdMap[srcEl.id] : null;
    const tgt = tgtEl ? shapeByIdMap[tgtEl.id] : null;
    if (src && tgt) connections.push({ from: src, to: tgt, label: "" });
  }

  // Detect provider from all text labels
  const allText = [...labeledShapes.map((s) => s.label), ...texts.map((t) => t.text)].join(" ").toLowerCase();
  let provider = null;
  if (/\b(ec2|s3|rds|vpc|aws|lambda|cloudfront|alb|ecs|eks|sqs|sns)\b/.test(allText)) provider = "aws";
  else if (/\b(azure|aks|blob|vnet|keyvault|appservice)\b/.test(allText)) provider = "azure";
  else if (/\b(gcp|gke|cloud run|pubsub|bigquery|firestore)\b/.test(allText)) provider = "gcp";

  return { provider, shapes: labeledShapes, connections };
}

// ── Shared: parsed data → text description ────────────────────────────────────

export function parsedToDescription({ provider, shapes, connections }, fileType) {
  const source = fileType === "excalidraw" ? "Excalidraw" : "Draw.io";
  const lines = [`Architecture imported from ${source} diagram.`, ""];

  if (provider) {
    lines.push(`Cloud provider detected: ${provider.toUpperCase()}`, "");
  }

  if (shapes.length > 0) {
    lines.push(`Infrastructure components (${shapes.length} total):`);
    for (const s of shapes) {
      const nameStr =
        s.serviceName !== s.label && s.label
          ? `${s.serviceName} (labeled: "${s.label}")`
          : s.serviceName;
      lines.push(`- ${nameStr}`);
    }
    lines.push("");
  }

  if (connections.length > 0) {
    lines.push(`Connections (${connections.length} total):`);
    for (const c of connections) {
      const fromName = c.from.label || c.from.serviceName;
      const toName = c.to.label || c.to.serviceName;
      const lbl = c.label ? ` [${c.label}]` : "";
      lines.push(`- ${fromName} → ${toName}${lbl}`);
    }
  }

  return lines.join("\n");
}

// ── Entry point: read a File object and return parsed result ──────────────────

export async function parseImportFile(file) {
  const name = file.name.toLowerCase();
  const isExcalidraw = name.endsWith(".excalidraw");
  const isDrawio = name.endsWith(".drawio") || name.endsWith(".xml");

  if (!isDrawio && !isExcalidraw) {
    throw new Error("Unsupported file. Drop a .drawio, .xml, or .excalidraw file.");
  }

  const text = await file.text();
  let parsed;
  const fileType = isExcalidraw ? "excalidraw" : "drawio";

  if (isExcalidraw) {
    parsed = parseExcalidraw(text);
  } else {
    parsed = await parseDrawio(text);
  }

  if (parsed.shapes.length === 0) {
    throw new Error(
      "No cloud service components were found in this diagram.\n" +
      "Make sure you used cloud icon shapes (AWS, Azure, or GCP icon libraries) in draw.io, " +
      "or label your shapes with service names in Excalidraw."
    );
  }

  const description = parsedToDescription(parsed, fileType);
  return { ...parsed, description, fileType, fileName: file.name };
}
