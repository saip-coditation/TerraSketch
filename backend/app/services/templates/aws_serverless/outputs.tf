output "api_endpoint" {
  value       = aws_apigatewayv2_stage.default.invoke_url
  description = "Live HTTP endpoint for the API (open in a browser to hit the Lambda)."
}

output "lambda_function_name" {
  value = aws_lambda_function.api.function_name
}

output "dynamodb_table_name" {
  value = aws_dynamodb_table.app.name
}
