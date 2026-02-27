#!/usr/bin/env python3
"""
ESP32 Fleet Manager Phase 2 Backend Test Suite
Testing REAL PlatformIO build service with actual ESP32-C3 compilation
"""

import requests
import sys
import time
import json
from datetime import datetime

class ESP32Phase2BackendTester:
    def __init__(self, base_url="https://device-control-forge.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.token = None
        self.user_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_data = {}

    def log(self, message):
        """Log message with timestamp"""
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None, timeout=30):
        """Run a single API test"""
        url = f"{self.base_url}{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        if self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'
        if headers:
            test_headers.update(headers)

        self.tests_run += 1
        self.log(f"Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, timeout=timeout)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, timeout=timeout)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers, timeout=timeout)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers, timeout=timeout)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                self.log(f"✅ {name} - Status: {response.status_code}")
                try:
                    return True, response.json()
                except:
                    return True, {}
            else:
                self.log(f"❌ {name} - Expected {expected_status}, got {response.status_code}")
                try:
                    error_detail = response.json()
                    self.log(f"   Error: {error_detail}")
                except:
                    self.log(f"   Response: {response.text}")
                return False, {}

        except Exception as e:
            self.log(f"❌ {name} - Exception: {str(e)}")
            return False, {}

    def test_login_admin(self):
        """Test login with provided admin credentials"""
        success, response = self.run_test(
            "Login Admin (admin@test.com)",
            "POST",
            "/auth/login",
            200,
            data={
                "email": "admin@test.com",
                "password": "test123"
            }
        )
        if success and 'token' in response:
            self.token = response['token']
            self.user_id = response['user']['id']
            self.log(f"   Logged in as: {response['user']['name']} ({response['user']['role']})")
        return success

    def test_create_phase2_project(self):
        """Create project named 'phase2-test' with ESP32-C3"""
        success, response = self.run_test(
            "Create Phase2 Test Project",
            "POST",
            "/projects",
            200,
            data={
                "name": "phase2-test",
                "board_type": "ESP32-C3"
            }
        )
        if success:
            self.test_data['project_id'] = response['id']
            self.log(f"   Project created with ID: {response['id']}")
            self.log(f"   Board type: {response.get('board_type')}")
        return success

    def test_trigger_real_build(self):
        """Trigger REAL PlatformIO build for ESP32-C3"""
        if 'project_id' not in self.test_data:
            self.log("⚠️  Skipping build test - no project created")
            return False
            
        self.log("🔨 Triggering REAL PlatformIO build (this will take ~60 seconds)...")
        success, response = self.run_test(
            "Trigger Real Build (v2.0.0)",
            "POST",
            "/builds",
            200,
            data={
                "project_id": self.test_data['project_id'],
                "target_version": "2.0.0"
            },
            timeout=10  # Initial trigger should be fast
        )
        if success:
            self.test_data['build_id'] = response['id']
            self.log(f"   Build started with ID: {response['id']}")
            self.log(f"   Status: {response['status']}")
            self.log(f"   Board: {response.get('board_type')}")
        return success

    def test_poll_build_status(self):
        """Poll build status until completion (max 30 attempts, 5s intervals)"""
        if 'build_id' not in self.test_data:
            self.log("⚠️  Skipping build polling - no build started")
            return False

        build_id = self.test_data['build_id']
        max_attempts = 30  # 30 * 5 = 150 seconds max
        attempt = 0
        
        self.log("⏳ Polling build status every 5 seconds...")
        
        while attempt < max_attempts:
            attempt += 1
            time.sleep(5)  # Wait 5 seconds between polls
            
            success, response = self.run_test(
                f"Poll Build Status (Attempt {attempt}/30)",
                "GET",
                f"/builds/{build_id}",
                200,
                timeout=10
            )
            
            if not success:
                return False
                
            status = response.get('status', 'unknown')
            logs_count = len(response.get('logs', []))
            self.log(f"   Status: {status} | Logs: {logs_count} lines")
            
            # Check if build is complete
            if status in ['success', 'failed']:
                self.test_data['final_build'] = response
                if status == 'success':
                    self.log("🎉 Build completed successfully!")
                    self.log(f"   Artifact hash: {response.get('artifact_hash', 'N/A')[:16]}...")
                    self.log(f"   Artifact size: {response.get('artifact_size', 0)} bytes")
                    self.log(f"   Artifact file: {response.get('artifact_file', 'N/A')}")
                    return True
                else:
                    self.log("❌ Build failed!")
                    return False
            elif status in ['building', 'queued']:
                # Continue polling
                continue
            else:
                self.log(f"❌ Unknown build status: {status}")
                return False
        
        self.log("❌ Build polling timeout - exceeded 150 seconds")
        return False

    def test_verify_build_result(self):
        """Verify build result has required Phase 2 attributes"""
        if 'final_build' not in self.test_data:
            self.log("⚠️  Skipping build verification - no completed build")
            return False
            
        build = self.test_data['final_build']
        
        # Check artifact hash (SHA-256)
        artifact_hash = build.get('artifact_hash', '')
        if not artifact_hash or len(artifact_hash) != 64:
            self.log(f"❌ Invalid artifact hash: {artifact_hash}")
            return False
        self.log(f"✅ Valid SHA-256 hash: {artifact_hash[:16]}...{artifact_hash[-8:]}")
        
        # Check artifact size > 100KB
        artifact_size = build.get('artifact_size', 0)
        if artifact_size < 100000:
            self.log(f"❌ Artifact too small: {artifact_size} bytes (expected > 100KB)")
            return False
        self.log(f"✅ Artifact size: {artifact_size} bytes ({artifact_size/1024:.1f} KB)")
        
        # Check artifact file ends with .bin
        artifact_file = build.get('artifact_file', '')
        if not artifact_file.endswith('.bin'):
            self.log(f"❌ Artifact file should be .bin: {artifact_file}")
            return False
        self.log(f"✅ Binary artifact: {artifact_file}")
        
        # Check manifest with signature
        manifest = build.get('manifest')
        if not manifest or 'signature' not in manifest:
            self.log("❌ No signed manifest found")
            return False
        self.log(f"✅ Signed manifest present with {len(manifest)} fields")
        
        self.tests_passed += 1
        self.log("✅ Build Verification - All requirements met")
        return True

    def test_ota_manifest_endpoint(self):
        """Test GET /api/ota/manifest/{build_id} returns signed manifest"""
        if 'build_id' not in self.test_data:
            self.log("⚠️  Skipping OTA manifest test - no build")
            return False
            
        success, response = self.run_test(
            "Get OTA Manifest",
            "GET",
            f"/ota/manifest/{self.test_data['build_id']}",
            200
        )
        
        if success:
            # Verify manifest structure
            required_fields = ['version', 'artifact_hash_sha256', 'signature']
            missing_fields = [f for f in required_fields if f not in response]
            if missing_fields:
                self.log(f"❌ Missing manifest fields: {missing_fields}")
                return False
            
            version = response.get('version')
            hash_sha256 = response.get('artifact_hash_sha256')
            signature = response.get('signature')
            
            self.log(f"   Version: {version}")
            self.log(f"   SHA-256: {hash_sha256[:16]}...{hash_sha256[-8:] if hash_sha256 else 'N/A'}")
            self.log(f"   Signature: {'Present' if signature else 'Missing'}")
            
        return success

    def test_ota_public_key_endpoint(self):
        """Test GET /api/ota/public-key returns RSA public key PEM"""
        success, response = self.run_test(
            "Get OTA Public Key",
            "GET",
            "/ota/public-key",
            200
        )
        
        if success:
            public_key_pem = response.get('public_key_pem', '')
            if not public_key_pem:
                self.log("❌ No public key PEM returned")
                return False
                
            # Basic PEM validation
            if not (public_key_pem.startswith('-----BEGIN') and public_key_pem.endswith('-----')):
                self.log("❌ Invalid PEM format")
                return False
                
            lines = public_key_pem.split('\n')
            self.log(f"   Public key: {lines[0]} ({len(lines)} lines)")
            
        return success

    def test_existing_successful_build(self):
        """Test against existing successful build mentioned in context"""
        existing_build_id = "9ae569a4-d784-48c5-aa7d-80730bc275db"
        self.log(f"🔍 Testing existing successful build: {existing_build_id}")
        
        success, response = self.run_test(
            "Get Existing Successful Build",
            "GET",
            f"/builds/{existing_build_id}",
            200
        )
        
        if success:
            status = response.get('status')
            artifact_size = response.get('artifact_size', 0)
            artifact_hash = response.get('artifact_hash', '')
            
            self.log(f"   Status: {status}")
            self.log(f"   Size: {artifact_size} bytes")
            self.log(f"   Hash: {artifact_hash[:16] if artifact_hash else 'N/A'}...")
            
            if status == 'success' and artifact_size > 100000 and len(artifact_hash) == 64:
                self.log("✅ Existing build meets Phase 2 requirements")
            else:
                self.log("⚠️  Existing build may not meet all Phase 2 requirements")
        
        return success

    def run_phase2_backend_tests(self):
        """Run Phase 2 backend test suite"""
        self.log("🚀 Starting ESP32 Fleet Manager Phase 2 Backend Tests")
        self.log("🔨 Testing REAL PlatformIO Build Service")
        self.log(f"📍 Testing against: {self.base_url}")
        self.log("-" * 70)

        test_methods = [
            # Authentication
            self.test_login_admin,
            
            # Project setup for Phase 2
            self.test_create_phase2_project,
            
            # Real build system tests
            self.test_trigger_real_build,
            self.test_poll_build_status,
            self.test_verify_build_result,
            
            # OTA endpoints
            self.test_ota_manifest_endpoint,
            self.test_ota_public_key_endpoint,
            
            # Existing build verification
            self.test_existing_successful_build,
        ]

        # Track critical failures
        critical_failures = []
        
        for test_method in test_methods:
            try:
                if not test_method():
                    critical_failures.append(test_method.__name__)
            except Exception as e:
                self.log(f"❌ Test {test_method.__name__} failed with exception: {e}")
                critical_failures.append(test_method.__name__)
            
            # Short delay between tests
            time.sleep(1)

        # Final summary
        self.log("-" * 70)
        self.log(f"🏁 Phase 2 Backend Test Summary")
        self.log(f"   Tests run: {self.tests_run}")
        self.log(f"   Tests passed: {self.tests_passed}")
        self.log(f"   Success rate: {(self.tests_passed/self.tests_run)*100:.1f}%")
        
        if critical_failures:
            self.log(f"❌ Critical failures in: {', '.join(critical_failures)}")
        
        if self.tests_passed >= self.tests_run * 0.8:  # 80% success threshold
            self.log("🎉 Phase 2 backend testing completed successfully!")
            return 0
        else:
            self.log("❌ Phase 2 backend testing failed")
            return 1

if __name__ == "__main__":
    tester = ESP32Phase2BackendTester()
    sys.exit(tester.run_phase2_backend_tests())