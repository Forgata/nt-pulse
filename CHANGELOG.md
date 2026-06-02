# Changelog

All notable changes will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). This changelog starts from version 1.0.0.

## [1.1.0] - 2026-06-02

### Added

- **Automated Client Topology Reflection:** Integrated an out-of-band JSON gateway reflection phase (`ip-api.com`) at client boot. The client now dynamically resolves its public IP metadata—extracting active ISP identification and precise geographic vectors (`latitude`, `longitude`)—completely eliminating hardcoded location coordinates.
- **Dynamic Proximity Routing Engine:** Refactored the Orchestrator’s `/discover` endpoint to ingest dynamic client coordinates. It now ranks and sorts the live `activeNodes` map using a real-time Haversine distance matrix, dynamically allocating the absolute closest edge server for the data plane pipeline.

### Fixed

- **HMAC Matrix Initialization Guard:** Resolved a critical runtime vulnerability where an uninitialized `ORCHESTRATOR_SECRET` environment variable caused `crypto.createHmac` to throw a silent `TypeError` inside the `/discover` telemetry pipeline. Implemented an explicit local development fallback string to ensure continuous operation during environment misconfigurations..

### Changed

- **Refactors**: moved all client function utilities in separate folder

### Updated

- Haversine Distance Calculation
