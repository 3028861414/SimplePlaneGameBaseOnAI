package com.aerolab.web;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
class SimulationApiTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void healthEndpointIsAvailable() throws Exception {
        mockMvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ok"));
    }

    @Test
    void simulationEndpointReturnsSerializableSurfaceAndFlowData() throws Exception {
        String payload = """
                {
                  "model": {
                    "name": "API Test",
                    "parts": [
                      {
                        "id": "fuselage",
                        "name": "Fuselage",
                        "shape": "CYLINDER",
                        "position": {"x": 0, "y": 0, "z": 0},
                        "rotation": {"x": 0, "y": 0, "z": -90},
                        "size": {"x": 1, "y": 4, "z": 1},
                        "color": "#c9d7df"
                      },
                      {
                        "id": "wing",
                        "name": "Wing",
                        "shape": "BOX",
                        "position": {"x": 0, "y": 0, "z": 0},
                        "rotation": {"x": 0, "y": 0, "z": 0},
                        "size": {"x": 1.5, "y": 0.1, "z": 7},
                        "color": "#35c6b1"
                      }
                    ],
                    "cockpit": {
                      "position": {"x": 1, "y": 0.7, "z": 0},
                      "yawDegrees": 0,
                      "pitchDegrees": -4
                    }
                  },
                  "conditions": {
                    "direction": {"x": -1, "y": 0, "z": 0},
                    "windSpeedMps": 35,
                    "airDensity": 1.225
                  }
                }
                """;

        mockMvc.perform(post("/api/simulations")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.solver").value("AeroLab PotentialFlow + Wake / v1"))
                .andExpect(jsonPath("$.flow.encoding").value("base64-float32-le"))
                .andExpect(jsonPath("$.flow.nx").isNumber())
                .andExpect(jsonPath("$.surface.parts.length()").value(2))
                .andExpect(jsonPath("$.surface.parts[0].positions").isArray())
                .andExpect(jsonPath("$.summary.dynamicPressurePa").value(0.5 * 1.225 * 35 * 35))
                .andExpect(jsonPath("$.summary.dragN").isNumber())
                .andExpect(jsonPath("$.warnings[0]").isString());
    }

    @Test
    void invalidModelIsRejectedWithProblemDetail() throws Exception {
        String payload = """
                {
                  "model": {
                    "name": "Broken",
                    "parts": [],
                    "cockpit": {
                      "position": {"x": 0, "y": 0, "z": 0},
                      "yawDegrees": 0,
                      "pitchDegrees": 0
                    }
                  },
                  "conditions": {
                    "direction": {"x": -1, "y": 0, "z": 0},
                    "windSpeedMps": 30,
                    "airDensity": 1.225
                  }
                }
                """;

        mockMvc.perform(post("/api/simulations")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("请求参数无效"))
                .andExpect(jsonPath("$.detail").value("模型至少需要一个部件"));
    }
}
