#!/usr/bin/env python3
"""
ESP32 Fleet Manager API Backend Test Suite
Tests all API endpoints comprehensively
"""

import requests
import sys
import time
import json
from datetime import datetime

class ESP32FleetAPITester:
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

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
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
                response = requests.get(url, headers=test_headers)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers)

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

    # Auth Tests
    def test_register_admin(self):
        """Test user registration (first user becomes admin)"""
        success, response = self.run_test(
            "Register Admin User",
            "POST",
            "/auth/register",
            200,
            data={
                "email": "admin@test.com",
                "password": "test123",
                "name": "Test Admin"
            }
        )
        if success and 'token' in response:
            self.token = response['token']
            self.user_id = response['user']['id']
            self.test_data['admin_token'] = self.token
            self.test_data['admin_id'] = self.user_id
            self.log(f"   Admin user created with role: {response['user']['role']}")
        return success

    def test_login_admin(self):
        """Test admin login"""
        success, response = self.run_test(
            "Login Admin",
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

    def test_get_me(self):
        """Test get current user info"""
        success, response = self.run_test(
            "Get Current User",
            "GET",
            "/auth/me",
            200
        )
        if success:
            self.log(f"   User: {response.get('name')} - {response.get('email')} ({response.get('role')})")
        return success

    # Device Tests
    def test_create_device(self):
        """Test device creation"""
        success, response = self.run_test(
            "Create Device",
            "POST",
            "/devices",
            200,
            data={
                "name": "Test ESP32 Device",
                "board_type": "ESP32-C3",
                "mac_address": "AA:BB:CC:DD:EE:FF"
            }
        )
        if success:
            self.test_data['device_id'] = response['id']
            self.test_data['claim_code'] = response['claim_code']
            self.log(f"   Device created with ID: {response['id']}")
            self.log(f"   Claim code: {response['claim_code']}")
        return success

    def test_list_devices(self):
        """Test device listing"""
        success, response = self.run_test(
            "List Devices",
            "GET",
            "/devices",
            200
        )
        if success:
            self.log(f"   Found {len(response)} devices")
        return success

    def test_get_device(self):
        """Test getting specific device"""
        if 'device_id' not in self.test_data:
            self.log("⚠️  Skipping get device test - no device created")
            return True
        
        success, response = self.run_test(
            "Get Device",
            "GET",
            f"/devices/{self.test_data['device_id']}",
            200
        )
        return success

    def test_claim_device(self):
        """Test device claiming"""
        if 'claim_code' not in self.test_data:
            self.log("⚠️  Skipping claim device test - no claim code")
            return True
            
        success, response = self.run_test(
            "Claim Device",
            "POST",
            "/devices/claim",
            200,
            data={"claim_code": self.test_data['claim_code']}
        )
        return success

    # Pin Config Tests
    def test_get_board_profile(self):
        """Test board profile retrieval"""
        success, response = self.run_test(
            "Get Board Profile",
            "GET",
            "/board-profile",
            200
        )
        if success:
            pins = response.get('pins', [])
            functions = response.get('functions', {})
            self.log(f"   Board has {len(pins)} pins and {len(functions)} functions")
        return success

    def test_get_pin_config(self):
        """Test pin configuration retrieval"""
        if 'device_id' not in self.test_data:
            self.log("⚠️  Skipping pin config test - no device")
            return True
            
        success, response = self.run_test(
            "Get Pin Config",
            "GET",
            f"/devices/{self.test_data['device_id']}/pins",
            200
        )
        return success

    def test_update_pin_config(self):
        """Test pin configuration update"""
        if 'device_id' not in self.test_data:
            self.log("⚠️  Skipping pin config update - no device")
            return True
            
        success, response = self.run_test(
            "Update Pin Config",
            "PUT",
            f"/devices/{self.test_data['device_id']}/pins",
            200,
            data={
                "pins": {
                    "0": "GPIO_OUTPUT",
                    "1": "GPIO_INPUT",
                    "2": "ADC"
                }
            }
        )
        return success

    def test_validate_pins(self):
        """Test pin validation"""
        success, response = self.run_test(
            "Validate Pin Config",
            "POST",
            "/pins/validate",
            200,
            data={
                "pins": {
                    "0": "GPIO_OUTPUT",
                    "1": "GPIO_INPUT"
                }
            }
        )
        if success:
            self.log(f"   Validation result: {'Valid' if response.get('valid') else 'Invalid'}")
        return success

    # Project Tests
    def test_create_project(self):
        """Test project creation"""
        success, response = self.run_test(
            "Create Project",
            "POST",
            "/projects",
            200,
            data={
                "name": "Test Sensor Project",
                "board_type": "ESP32-C3"
            }
        )
        if success:
            self.test_data['project_id'] = response['id']
            self.log(f"   Project created with ID: {response['id']}")
            files = response.get('files', [])
            self.log(f"   Project has {len(files)} files")
        return success

    def test_list_projects(self):
        """Test project listing"""
        success, response = self.run_test(
            "List Projects",
            "GET",
            "/projects",
            200
        )
        if success:
            self.log(f"   Found {len(response)} projects")
        return success

    def test_get_project(self):
        """Test getting specific project"""
        if 'project_id' not in self.test_data:
            self.log("⚠️  Skipping get project test - no project created")
            return True
            
        success, response = self.run_test(
            "Get Project",
            "GET",
            f"/projects/{self.test_data['project_id']}",
            200
        )
        return success

    def test_update_project(self):
        """Test project update"""
        if 'project_id' not in self.test_data:
            self.log("⚠️  Skipping project update - no project")
            return True
            
        success, response = self.run_test(
            "Update Project",
            "PUT",
            f"/projects/{self.test_data['project_id']}",
            200,
            data={
                "files": [
                    {
                        "name": "main.c",
                        "content": "#include <stdio.h>\nint main() { return 0; }"
                    },
                    {
                        "name": "sensor.c",
                        "content": "// Sensor functions"
                    }
                ]
            }
        )
        return success

    # Build Tests
    def test_trigger_build(self):
        """Test build triggering (MOCKED)"""
        if 'project_id' not in self.test_data:
            self.log("⚠️  Skipping build test - no project")
            return True
            
        success, response = self.run_test(
            "Trigger Build",
            "POST",
            "/builds",
            200,
            data={
                "project_id": self.test_data['project_id'],
                "target_version": "1.0.0"
            }
        )
        if success:
            self.test_data['build_id'] = response['id']
            self.log(f"   Build started with ID: {response['id']}")
            self.log(f"   Status: {response['status']}")
        return success

    def test_list_builds(self):
        """Test build listing"""
        success, response = self.run_test(
            "List Builds",
            "GET",
            "/builds",
            200
        )
        if success:
            self.log(f"   Found {len(response)} builds")
        return success

    def test_get_build(self):
        """Test getting build details"""
        if 'build_id' not in self.test_data:
            self.log("⚠️  Skipping get build test - no build")
            return True
            
        # Wait a moment for build to progress
        time.sleep(3)
        success, response = self.run_test(
            "Get Build",
            "GET",
            f"/builds/{self.test_data['build_id']}",
            200
        )
        if success:
            self.log(f"   Build status: {response.get('status')}")
            logs = response.get('logs', [])
            self.log(f"   Build logs: {len(logs)} entries")
        return success

    # Deployment Tests
    def test_create_deployment(self):
        """Test deployment creation"""
        # Need successful build and device
        if 'build_id' not in self.test_data or 'device_id' not in self.test_data:
            self.log("⚠️  Skipping deployment test - need build and device")
            return True

        # Wait for build to complete (mocked build should finish)
        self.log("   Waiting for build to complete...")
        time.sleep(8)  # Mock build takes about 10 seconds total
        
        success, response = self.run_test(
            "Create Deployment",
            "POST",
            "/deployments",
            200,
            data={
                "build_id": self.test_data['build_id'],
                "target_device_ids": [self.test_data['device_id']],
                "rollout_percent": 100,
                "rollout_strategy": "immediate"
            }
        )
        if success:
            self.test_data['deployment_id'] = response['id']
            self.log(f"   Deployment created with ID: {response['id']}")
        return success

    def test_list_deployments(self):
        """Test deployment listing"""
        success, response = self.run_test(
            "List Deployments",
            "GET",
            "/deployments",
            200
        )
        if success:
            self.log(f"   Found {len(response)} deployments")
        return success

    # Telemetry Tests
    def test_telemetry_dashboard(self):
        """Test telemetry dashboard"""
        success, response = self.run_test(
            "Telemetry Dashboard",
            "GET",
            "/telemetry/dashboard",
            200
        )
        if success:
            self.log(f"   Total devices: {response.get('total_devices', 0)}")
            self.log(f"   Online: {response.get('online', 0)}, Offline: {response.get('offline', 0)}")
        return success

    # Audit Log Tests
    def test_audit_logs(self):
        """Test audit log listing"""
        success, response = self.run_test(
            "List Audit Logs",
            "GET",
            "/audit-logs?limit=50",
            200
        )
        if success:
            self.log(f"   Found {len(response)} audit log entries")
        return success

    # User Management Tests
    def test_list_users(self):
        """Test user listing (admin only)"""
        success, response = self.run_test(
            "List Users",
            "GET",
            "/users",
            200
        )
        if success:
            self.log(f"   Found {len(response)} users")
        return success

    # Cleanup Tests
    def test_delete_project(self):
        """Test project deletion"""
        if 'project_id' not in self.test_data:
            self.log("⚠️  No project to delete")
            return True
            
        success, response = self.run_test(
            "Delete Project",
            "DELETE",
            f"/projects/{self.test_data['project_id']}",
            200
        )
        return success

    def test_delete_device(self):
        """Test device deletion"""
        if 'device_id' not in self.test_data:
            self.log("⚠️  No device to delete")
            return True
            
        success, response = self.run_test(
            "Delete Device",
            "DELETE",
            f"/devices/{self.test_data['device_id']}",
            200
        )
        return success

    def run_all_tests(self):
        """Run comprehensive test suite"""
        self.log("🚀 Starting ESP32 Fleet Manager API Tests")
        self.log(f"📍 Testing against: {self.base_url}")
        self.log("-" * 60)

        # Test sequence (order matters for dependencies)
        test_methods = [
            # Auth tests
            self.test_register_admin,
            self.test_login_admin, 
            self.test_get_me,
            
            # Device tests
            self.test_create_device,
            self.test_list_devices,
            self.test_get_device,
            self.test_claim_device,
            
            # Pin config tests
            self.test_get_board_profile,
            self.test_get_pin_config,
            self.test_update_pin_config,
            self.test_validate_pins,
            
            # Project tests
            self.test_create_project,
            self.test_list_projects,
            self.test_get_project,
            self.test_update_project,
            
            # Build tests (mocked)
            self.test_trigger_build,
            self.test_list_builds,
            self.test_get_build,
            
            # Deployment tests
            self.test_create_deployment,
            self.test_list_deployments,
            
            # Telemetry tests
            self.test_telemetry_dashboard,
            
            # Audit and user tests
            self.test_audit_logs,
            self.test_list_users,
            
            # Cleanup
            self.test_delete_project,
            self.test_delete_device,
        ]

        for test_method in test_methods:
            try:
                test_method()
            except Exception as e:
                self.log(f"❌ Test {test_method.__name__} failed with exception: {e}")
            
            # Small delay between tests
            time.sleep(0.5)

        # Final summary
        self.log("-" * 60)
        self.log(f"🏁 Test Summary")
        self.log(f"   Tests run: {self.tests_run}")
        self.log(f"   Tests passed: {self.tests_passed}")
        self.log(f"   Success rate: {(self.tests_passed/self.tests_run)*100:.1f}%")
        
        if self.tests_passed == self.tests_run:
            self.log("🎉 All tests passed!")
            return 0
        else:
            self.log("❌ Some tests failed")
            return 1

if __name__ == "__main__":
    tester = ESP32FleetAPITester()
    sys.exit(tester.run_all_tests())