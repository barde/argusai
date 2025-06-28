#!/bin/bash

# Script to create all required labels for the repository
# Run this once to set up all labels that workflows will use

echo "Creating GitHub labels for ArgusAI..."

# Size labels
gh label create "size/XS" --description "Pull request with less than 10 lines" --color "008672"
gh label create "size/S" --description "Pull request with less than 50 lines" --color "00D084"
gh label create "size/M" --description "Pull request with less than 200 lines" --color "FBCA04"
gh label create "size/L" --description "Pull request with less than 500 lines" --color "F9A602"
gh label create "size/XL" --description "Pull request with 500+ lines" --color "D93F0B"

# Category labels from labeler.yml
gh label create "documentation" --description "Documentation changes" --color "0075CA"
gh label create "infrastructure" --description "Infrastructure and build changes" --color "C5DEF5"
gh label create "dependencies" --description "Dependency updates" --color "0366D6"
gh label create "tests" --description "Test changes" --color "BFD4F2"
gh label create "source" --description "Source code changes" --color "5319E7"
gh label create "api" --description "API changes" --color "1D76DB"
gh label create "llm" --description "LLM/AI related changes" --color "B60205"

# Other useful labels
gh label create "bug" --description "Something isn't working" --color "D73A4A"
gh label create "enhancement" --description "New feature or request" --color "A2EEEF"
gh label create "security" --description "Security related" --color "EE0701"
gh label create "stale" --description "No recent activity" --color "795548"

echo "Done! All labels have been created."