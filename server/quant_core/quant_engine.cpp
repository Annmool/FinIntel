/**
 * FinIntel High-Performance Quantitative Computing Core
 * C++20 Engine for Multi-Asset Monte Carlo Simulation, Risk Analytics (VaR/CVaR),
 * and Markowitz Mean-Variance Portfolio Optimization.
 *
 * Architecture:
 * - Compiled with MSYS2 GCC 14.2.0 (x86_64, UCRT64)
 * - OpenMP multi-threading with thread-local PRNG (Mersenne Twister 64-bit mt19937_64)
 * - Cholesky Decomposition for correlated geometric Brownian motion (GBM)
 * - Zero external library dependencies (self-contained, standalone static binary)
 */

#include <iostream>
#include <vector>
#include <string>
#include <sstream>
#include <cmath>
#include <algorithm>
#include <random>
#include <chrono>
#include <iomanip>
#include <omp.h>

// Simple minimal JSON writer helper
struct QuantResult {
    // Benchmark
    double cppExecutionTimeMs;
    int numThreads;
    long long totalSimulatedSteps;
    double throughputStepsPerSec;

    // Portfolio metrics
    double initialValue;
    double expectedReturn;
    double portfolioVolatility;
    double currentSharpe;

    // Risk Metrics
    double var95_dollar;
    double var95_percent;
    double var99_dollar;
    double var99_percent;
    double cvar95_dollar;
    double cvar95_percent;
    double cvar99_dollar;
    double cvar99_percent;
    double maxDrawdownMean;
    double maxDrawdownWorst;

    // Trajectory percentiles across time steps
    std::vector<std::string> dates;
    std::vector<double> p5Trajectory;
    std::vector<double> p25Trajectory;
    std::vector<double> p50Trajectory;
    std::vector<double> p75Trajectory;
    std::vector<double> p95Trajectory;
    std::vector<std::vector<double>> samplePaths; // 15 sample paths

    // Terminal distribution histogram (20 bins)
    std::vector<double> histogramBins;
    std::vector<int> histogramCounts;

    // Markowitz Efficient Frontier
    struct FrontierPoint {
        double volatility;
        double expectedReturn;
        double sharpe;
        std::vector<double> weights;
    };
    std::vector<FrontierPoint> frontierPoints;
    FrontierPoint maxSharpePortfolio;
    FrontierPoint minVolPortfolio;
};

// Cholesky decomposition: A = L * L^T where A is positive semi-definite correlation/covariance matrix
std::vector<std::vector<double>> choleskyDecomposition(const std::vector<std::vector<double>>& matrix, int n) {
    std::vector<std::vector<double>> L(n, std::vector<double>(n, 0.0));
    for (int i = 0; i < n; i++) {
        for (int j = 0; j <= i; j++) {
            double sum = 0.0;
            for (int k = 0; k < j; k++) {
                sum += L[i][k] * L[j][k];
            }
            if (i == j) {
                double val = matrix[i][i] - sum;
                L[i][j] = (val > 1e-12) ? std::sqrt(val) : 0.0;
            } else {
                L[i][j] = (L[j][j] > 1e-12) ? (matrix[i][j] - sum) / L[j][j] : 0.0;
            }
        }
    }
    return L;
}

// Minimal fast JSON string parser for input
struct SimInput {
    int numSimulations = 50000;
    int timeHorizonDays = 90;
    double initialPortfolioValue = 100000.0;
    double riskFreeRate = 0.045; // 4.5% annual risk-free rate
    std::vector<std::string> symbols;
    std::vector<double> weights;
    std::vector<double> expectedReturns; // Annualized
    std::vector<double> volatilities;    // Annualized
    std::vector<std::vector<double>> correlationMatrix;
};

// Helper: parse string to double safely
double parseDoubleSafe(const std::string& str, double defVal = 0.0) {
    try {
        return std::stod(str);
    } catch (...) {
        return defVal;
    }
}

// Naive robust JSON parser for flat input structures
SimInput parseInputJson(const std::string& json) {
    SimInput in;
    auto findValue = [&](const std::string& key) -> std::string {
        std::string pattern = "\"" + key + "\":";
        size_t pos = json.find(pattern);
        if (pos == std::string::npos) return "";
        pos += pattern.length();
        while (pos < json.length() && (json[pos] == ' ' || json[pos] == '\t')) pos++;
        if (pos >= json.length()) return "";
        
        if (json[pos] == '"') {
            size_t end = json.find('"', pos + 1);
            return (end != std::string::npos) ? json.substr(pos + 1, end - pos - 1) : "";
        } else if (json[pos] == '[' || json[pos] == '{') {
            int depth = 0;
            size_t start = pos;
            while (pos < json.length()) {
                if (json[pos] == '[' || json[pos] == '{') depth++;
                else if (json[pos] == ']' || json[pos] == '}') {
                    depth--;
                    if (depth == 0) return json.substr(start, pos - start + 1);
                }
                pos++;
            }
            return "";
        } else {
            size_t end = json.find_first_of(",}\n\r", pos);
            return (end != std::string::npos) ? json.substr(pos, end - pos) : json.substr(pos);
        }
    };

    std::string val;
    val = findValue("numSimulations");
    if (!val.empty()) in.numSimulations = std::max(100, std::min(500000, std::stoi(val)));

    val = findValue("timeHorizonDays");
    if (!val.empty()) in.timeHorizonDays = std::max(5, std::min(730, std::stoi(val)));

    val = findValue("initialPortfolioValue");
    if (!val.empty()) in.initialPortfolioValue = parseDoubleSafe(val, 100000.0);

    val = findValue("riskFreeRate");
    if (!val.empty()) in.riskFreeRate = parseDoubleSafe(val, 0.045);

    // Parse symbols array
    std::string symStr = findValue("symbols");
    if (!symStr.empty()) {
        size_t p = 0;
        while ((p = symStr.find('"', p)) != std::string::npos) {
            size_t end = symStr.find('"', p + 1);
            if (end == std::string::npos) break;
            in.symbols.push_back(symStr.substr(p + 1, end - p - 1));
            p = end + 1;
        }
    }

    // Helper to parse double array
    auto parseDoubleArray = [&](const std::string& arrStr) -> std::vector<double> {
        std::vector<double> res;
        size_t p = 0;
        while (p < arrStr.length()) {
            while (p < arrStr.length() && (arrStr[p] == ' ' || arrStr[p] == '[' || arrStr[p] == ',' || arrStr[p] == '\n')) p++;
            if (p >= arrStr.length() || arrStr[p] == ']') break;
            size_t end = arrStr.find_first_of(",]", p);
            if (end == std::string::npos) end = arrStr.length();
            std::string tok = arrStr.substr(p, end - p);
            res.push_back(parseDoubleSafe(tok, 0.0));
            p = (end < arrStr.length() && arrStr[end] == ',') ? end + 1 : end;
        }
        return res;
    };

    in.weights = parseDoubleArray(findValue("weights"));
    in.expectedReturns = parseDoubleArray(findValue("expectedReturns"));
    in.volatilities = parseDoubleArray(findValue("volatilities"));

    // If empty or missing, provide defaults
    if (in.symbols.empty()) {
        in.symbols = {"AAPL", "MSFT", "GOOGL", "NVDA"};
        in.weights = {0.25, 0.25, 0.25, 0.25};
        in.expectedReturns = {0.18, 0.16, 0.14, 0.32};
        in.volatilities = {0.22, 0.20, 0.24, 0.38};
    }

    size_t n = in.symbols.size();
    if (in.weights.size() < n) in.weights.resize(n, 1.0 / n);
    if (in.expectedReturns.size() < n) in.expectedReturns.resize(n, 0.12);
    if (in.volatilities.size() < n) in.volatilities.resize(n, 0.20);

    // Normalize weights
    double wSum = 0.0;
    for (double w : in.weights) wSum += w;
    if (wSum > 1e-6) {
        for (double& w : in.weights) w /= wSum;
    } else {
        for (double& w : in.weights) w = 1.0 / n;
    }

    // Correlation matrix
    std::string corrStr = findValue("correlationMatrix");
    if (!corrStr.empty()) {
        size_t pos = 0;
        while ((pos = corrStr.find('[', pos)) != std::string::npos) {
            size_t end = corrStr.find(']', pos);
            if (end == std::string::npos) break;
            std::string rowStr = corrStr.substr(pos + 1, end - pos - 1);
            if (!rowStr.empty()) {
                in.correlationMatrix.push_back(parseDoubleArray("[" + rowStr + "]"));
            }
            pos = end + 1;
        }
    }

    // Default correlation matrix if not supplied or invalid
    if (in.correlationMatrix.size() != n) {
        in.correlationMatrix.assign(n, std::vector<double>(n, 0.45));
        for (size_t i = 0; i < n; i++) in.correlationMatrix[i][i] = 1.0;
    }

    return in;
}

// Markowitz Optimization & Efficient Frontier via Random Sampling + Boundary Extremes
void computeEfficientFrontier(
    const SimInput& in,
    QuantResult& out,
    const std::vector<std::vector<double>>& covMatrix,
    int numSamples = 2500
) {
    int n = in.symbols.size();
    std::mt19937_64 rng(1337);
    std::uniform_real_distribution<double> dist(0.0, 1.0);

    QuantResult::FrontierPoint bestSharpe;
    bestSharpe.sharpe = -9999.0;

    QuantResult::FrontierPoint minVol;
    minVol.volatility = 999999.0;

    std::vector<QuantResult::FrontierPoint> points;
    points.reserve(numSamples + n + 1);

    // 1. Single-asset corner points
    for (int i = 0; i < n; i++) {
        QuantResult::FrontierPoint p;
        p.weights.assign(n, 0.0);
        p.weights[i] = 1.0;
        p.expectedReturn = in.expectedReturns[i];
        p.volatility = in.volatilities[i];
        p.sharpe = (p.volatility > 1e-6) ? (p.expectedReturn - in.riskFreeRate) / p.volatility : 0.0;
        points.push_back(p);

        if (p.sharpe > bestSharpe.sharpe) bestSharpe = p;
        if (p.volatility < minVol.volatility) minVol = p;
    }

    // 2. Uniform random Dirichlet weights sampling
    for (int s = 0; s < numSamples; s++) {
        std::vector<double> w(n);
        double sum = 0.0;
        for (int i = 0; i < n; i++) {
            // Exponential distribution yields uniform Dirichlet on simplex
            w[i] = -std::log(std::max(1e-10, dist(rng)));
            sum += w[i];
        }
        for (int i = 0; i < n; i++) w[i] /= sum;

        // Portfolio expected return: w^T * mu
        double portReturn = 0.0;
        for (int i = 0; i < n; i++) portReturn += w[i] * in.expectedReturns[i];

        // Portfolio variance: w^T * Cov * w
        double portVar = 0.0;
        for (int i = 0; i < n; i++) {
            for (int j = 0; j < n; j++) {
                portVar += w[i] * w[j] * covMatrix[i][j];
            }
        }
        double portVol = std::sqrt(std::max(0.0, portVar));
        double sharpe = (portVol > 1e-6) ? (portReturn - in.riskFreeRate) / portVol : 0.0;

        QuantResult::FrontierPoint p;
        p.expectedReturn = portReturn;
        p.volatility = portVol;
        p.sharpe = sharpe;
        p.weights = w;
        points.push_back(p);

        if (sharpe > bestSharpe.sharpe) bestSharpe = p;
        if (portVol < minVol.volatility) minVol = p;
    }

    // Sort by volatility to construct the upper boundary curve (Efficient Frontier)
    std::sort(points.begin(), points.end(), [](const QuantResult::FrontierPoint& a, const QuantResult::FrontierPoint& b) {
        return a.volatility < b.volatility;
    });

    // Extract Pareto optimal frontier points
    std::vector<QuantResult::FrontierPoint> frontier;
    double maxReturnSoFar = -9999.0;
    for (const auto& pt : points) {
        if (pt.expectedReturn > maxReturnSoFar) {
            maxReturnSoFar = pt.expectedReturn;
            frontier.push_back(pt);
        }
    }

    out.frontierPoints = frontier;
    out.maxSharpePortfolio = bestSharpe;
    out.minVolPortfolio = minVol;
}

int main(int argc, char* argv[]) {
    // Read input from stdin or argument
    std::string inputJson;
    if (argc > 1) {
        for (int i = 1; i < argc; i++) {
            if (i > 1) inputJson += " ";
            inputJson += argv[i];
        }
    } else {
        std::string line;
        while (std::getline(std::cin, line)) {
            inputJson += line;
        }
    }

    SimInput in = parseInputJson(inputJson);
    int n = in.symbols.size();
    int M = in.numSimulations;
    int T = in.timeHorizonDays;
    double dt = 1.0 / 252.0; // Daily trading time step

    auto startTime = std::chrono::high_resolution_clock::now();

    // 1. Build Covariance Matrix: Cov(i, j) = Corr(i, j) * Vol(i) * Vol(j)
    std::vector<std::vector<double>> covMatrix(n, std::vector<double>(n, 0.0));
    for (int i = 0; i < n; i++) {
        for (int j = 0; j < n; j++) {
            covMatrix[i][j] = in.correlationMatrix[i][j] * in.volatilities[i] * in.volatilities[j];
        }
    }

    // 2. Cholesky Decomposition of correlation matrix for correlated shocks
    std::vector<std::vector<double>> L = choleskyDecomposition(in.correlationMatrix, n);

    // 3. Compute baseline current portfolio expected return and volatility
    double currentPortReturn = 0.0;
    for (int i = 0; i < n; i++) currentPortReturn += in.weights[i] * in.expectedReturns[i];

    double currentPortVar = 0.0;
    for (int i = 0; i < n; i++) {
        for (int j = 0; j < n; j++) {
            currentPortVar += in.weights[i] * in.weights[j] * covMatrix[i][j];
        }
    }
    double currentPortVol = std::sqrt(std::max(0.0, currentPortVar));
    double currentSharpe = (currentPortVol > 1e-6) ? (currentPortReturn - in.riskFreeRate) / currentPortVol : 0.0;

    // 4. Multi-threaded Monte Carlo Simulation
    // Storage for ending portfolio values and trajectories
    std::vector<double> endingValues(M, 0.0);
    std::vector<double> maxDrawdowns(M, 0.0);

    // We store trajectories for percentiles at discrete snapshot days (e.g. 10 time snapshots)
    int snapshotSteps = std::min(T, 25);
    std::vector<int> snapshotIndices(snapshotSteps);
    for (int s = 0; s < snapshotSteps; s++) {
        snapshotIndices[s] = (s + 1) * T / snapshotSteps;
    }

    // Trajectory matrix for percentile calculation: snapshotSteps rows x M simulations
    std::vector<std::vector<double>> snapshotValues(snapshotSteps, std::vector<double>(M, 0.0));

    // Sample paths to visualize in UI (take first 15)
    int numSamplePaths = 15;
    std::vector<std::vector<double>> samplePaths(numSamplePaths, std::vector<double>(snapshotSteps, in.initialPortfolioValue));

    int numThreads = omp_get_max_threads();

    #pragma omp parallel
    {
        int tid = omp_get_thread_num();
        // High quality 64-bit Mersenne Twister seeded uniquely per thread
        std::mt19937_64 rng(std::random_device{}() + tid * 104729);
        std::normal_distribution<double> normDist(0.0, 1.0);

        std::vector<double> indShocks(n);
        std::vector<double> corrShocks(n);
        std::vector<double> assetValues(n);

        #pragma omp for schedule(static)
        for (int sim = 0; sim < M; sim++) {
            // Initial asset value allocation
            for (int i = 0; i < n; i++) {
                assetValues[i] = in.initialPortfolioValue * in.weights[i];
            }

            double peakValue = in.initialPortfolioValue;
            double worstDrawdown = 0.0;
            int nextSnapshot = 0;

            for (int t = 1; t <= T; t++) {
                // Generate independent Gaussian standard normals
                for (int i = 0; i < n; i++) {
                    indShocks[i] = normDist(rng);
                }

                // Correlate shocks using Cholesky lower triangular matrix: corrShocks = L * indShocks
                for (int i = 0; i < n; i++) {
                    double sum = 0.0;
                    for (int k = 0; k <= i; k++) {
                        sum += L[i][k] * indShocks[k];
                    }
                    corrShocks[i] = sum;
                }

                // Evolve each asset via Geometric Brownian Motion
                double portTotal = 0.0;
                for (int i = 0; i < n; i++) {
                    double drift = (in.expectedReturns[i] - 0.5 * in.volatilities[i] * in.volatilities[i]) * dt;
                    double diffusion = in.volatilities[i] * std::sqrt(dt) * corrShocks[i];
                    assetValues[i] *= std::exp(drift + diffusion);
                    portTotal += assetValues[i];
                }

                // Track Peak & Drawdown
                if (portTotal > peakValue) peakValue = portTotal;
                double dd = (peakValue > 1e-6) ? (peakValue - portTotal) / peakValue : 0.0;
                if (dd > worstDrawdown) worstDrawdown = dd;

                // Snapshot recording
                if (nextSnapshot < snapshotSteps && t == snapshotIndices[nextSnapshot]) {
                    snapshotValues[nextSnapshot][sim] = portTotal;
                    if (sim < numSamplePaths) {
                        samplePaths[sim][nextSnapshot] = portTotal;
                    }
                    nextSnapshot++;
                }
            }

            // Portfolio total value at terminal step
            double terminalTotal = 0.0;
            for (int i = 0; i < n; i++) terminalTotal += assetValues[i];
            endingValues[sim] = terminalTotal;
            maxDrawdowns[sim] = worstDrawdown;
        }
    }

    // 5. Percentile Trajectories
    std::vector<double> p5Trajectory(snapshotSteps);
    std::vector<double> p25Trajectory(snapshotSteps);
    std::vector<double> p50Trajectory(snapshotSteps);
    std::vector<double> p75Trajectory(snapshotSteps);
    std::vector<double> p95Trajectory(snapshotSteps);

    for (int s = 0; s < snapshotSteps; s++) {
        std::vector<double>& vals = snapshotValues[s];
        std::sort(vals.begin(), vals.end());
        p5Trajectory[s] = vals[static_cast<size_t>(M * 0.05)];
        p25Trajectory[s] = vals[static_cast<size_t>(M * 0.25)];
        p50Trajectory[s] = vals[static_cast<size_t>(M * 0.50)];
        p75Trajectory[s] = vals[static_cast<size_t>(M * 0.75)];
        p95Trajectory[s] = vals[static_cast<size_t>(M * 0.95)];
    }

    // 6. Compute VaR and CVaR from terminal distribution
    std::vector<double> sortedEndings = endingValues;
    std::sort(sortedEndings.begin(), sortedEndings.end());

    size_t idx95 = static_cast<size_t>(M * 0.05);
    size_t idx99 = static_cast<size_t>(M * 0.01);

    double valueAtRisk95 = std::max(0.0, in.initialPortfolioValue - sortedEndings[idx95]);
    double valueAtRisk99 = std::max(0.0, in.initialPortfolioValue - sortedEndings[idx99]);

    // CVaR (Expected Shortfall): average loss of worst 5% / 1%
    double cvar95Sum = 0.0;
    for (size_t i = 0; i <= idx95; i++) {
        cvar95Sum += (in.initialPortfolioValue - sortedEndings[i]);
    }
    double cvar95 = (idx95 > 0) ? (cvar95Sum / (idx95 + 1)) : valueAtRisk95;

    double cvar99Sum = 0.0;
    for (size_t i = 0; i <= idx99; i++) {
        cvar99Sum += (in.initialPortfolioValue - sortedEndings[i]);
    }
    double cvar99 = (idx99 > 0) ? (cvar99Sum / (idx99 + 1)) : valueAtRisk99;

    // Drawdown stats
    std::sort(maxDrawdowns.begin(), maxDrawdowns.end());
    double meanDrawdown = 0.0;
    for (double dd : maxDrawdowns) meanDrawdown += dd;
    meanDrawdown /= M;
    double worstDrawdown99 = maxDrawdowns[static_cast<size_t>(M * 0.99)];

    // 7. Terminal Distribution Histogram (20 bins)
    int numBins = 20;
    double minVal = sortedEndings.front();
    double maxVal = sortedEndings.back();
    double binWidth = (maxVal - minVal) / numBins;
    if (binWidth < 1e-4) binWidth = 1.0;

    std::vector<double> histBins(numBins);
    std::vector<int> histCounts(numBins, 0);
    for (int b = 0; b < numBins; b++) {
        histBins[b] = minVal + (b + 0.5) * binWidth;
    }
    for (double val : sortedEndings) {
        int b = static_cast<int>((val - minVal) / binWidth);
        if (b < 0) b = 0;
        if (b >= numBins) b = numBins - 1;
        histCounts[b]++;
    }

    // 8. Efficient Frontier & Markowitz Optimization
    QuantResult qRes;
    computeEfficientFrontier(in, qRes, covMatrix, 2000);

    auto endTime = std::chrono::high_resolution_clock::now();
    double execTimeMs = std::chrono::duration<double, std::milli>(endTime - startTime).count();
    long long totalSteps = static_cast<long long>(M) * T * n;
    double throughput = (execTimeMs > 0) ? (totalSteps / (execTimeMs / 1000.0)) : 0.0;

    // 9. Output JSON
    std::cout << std::fixed << std::setprecision(4);
    std::cout << "{\n";
    std::cout << "  \"engine\": \"FinIntel C++20 High-Performance Quant Core (MSYS2 UCRT64 GCC 14.2)\",\n";
    std::cout << "  \"benchmark\": {\n";
    std::cout << "    \"executionTimeMs\": " << execTimeMs << ",\n";
    std::cout << "    \"numThreads\": " << numThreads << ",\n";
    std::cout << "    \"simulations\": " << M << ",\n";
    std::cout << "    \"timeHorizonDays\": " << T << ",\n";
    std::cout << "    \"totalSimulatedSteps\": " << totalSteps << ",\n";
    std::cout << "    \"throughputStepsPerSec\": " << throughput << "\n";
    std::cout << "  },\n";
    std::cout << "  \"portfolio\": {\n";
    std::cout << "    \"initialValue\": " << in.initialPortfolioValue << ",\n";
    std::cout << "    \"expectedReturn\": " << currentPortReturn << ",\n";
    std::cout << "    \"volatility\": " << currentPortVol << ",\n";
    std::cout << "    \"sharpeRatio\": " << currentSharpe << "\n";
    std::cout << "  },\n";
    std::cout << "  \"risk\": {\n";
    std::cout << "    \"var95_dollar\": " << valueAtRisk95 << ",\n";
    std::cout << "    \"var95_percent\": " << (valueAtRisk95 / in.initialPortfolioValue) * 100.0 << ",\n";
    std::cout << "    \"var99_dollar\": " << valueAtRisk99 << ",\n";
    std::cout << "    \"var99_percent\": " << (valueAtRisk99 / in.initialPortfolioValue) * 100.0 << ",\n";
    std::cout << "    \"cvar95_dollar\": " << cvar95 << ",\n";
    std::cout << "    \"cvar95_percent\": " << (cvar95 / in.initialPortfolioValue) * 100.0 << ",\n";
    std::cout << "    \"cvar99_dollar\": " << cvar99 << ",\n";
    std::cout << "    \"cvar99_percent\": " << (cvar99 / in.initialPortfolioValue) * 100.0 << ",\n";
    std::cout << "    \"maxDrawdownMean\": " << meanDrawdown * 100.0 << ",\n";
    std::cout << "    \"maxDrawdownWorst99\": " << worstDrawdown99 * 100.0 << "\n";
    std::cout << "  },\n";

    // Snapshot days
    std::cout << "  \"snapshotDays\": [";
    for (size_t i = 0; i < snapshotIndices.size(); i++) {
        std::cout << snapshotIndices[i] << (i + 1 < snapshotIndices.size() ? "," : "");
    }
    std::cout << "],\n";

    // Percentile Trajectories
    auto printArray = [](const std::string& name, const std::vector<double>& arr, bool comma = true) {
        std::cout << "    \"" << name << "\": [";
        for (size_t i = 0; i < arr.size(); i++) {
            std::cout << arr[i] << (i + 1 < arr.size() ? "," : "");
        }
        std::cout << "]" << (comma ? ",\n" : "\n");
    };

    std::cout << "  \"trajectories\": {\n";
    printArray("p5", p5Trajectory);
    printArray("p25", p25Trajectory);
    printArray("p50", p50Trajectory);
    printArray("p75", p75Trajectory);
    printArray("p95", p95Trajectory, false);
    std::cout << "  },\n";

    // Sample Paths
    std::cout << "  \"samplePaths\": [\n";
    for (size_t p = 0; p < samplePaths.size(); p++) {
        std::cout << "    [";
        for (size_t s = 0; s < samplePaths[p].size(); s++) {
            std::cout << samplePaths[p][s] << (s + 1 < samplePaths[p].size() ? "," : "");
        }
        std::cout << "]" << (p + 1 < samplePaths.size() ? ",\n" : "\n");
    }
    std::cout << "  ],\n";

    // Histogram
    std::cout << "  \"histogram\": {\n";
    printArray("bins", histBins);
    std::cout << "    \"counts\": [";
    for (size_t i = 0; i < histCounts.size(); i++) {
        std::cout << histCounts[i] << (i + 1 < histCounts.size() ? "," : "");
    }
    std::cout << "]\n";
    std::cout << "  },\n";

    // Markowitz Efficient Frontier
    std::cout << "  \"efficientFrontier\": {\n";
    std::cout << "    \"maxSharpe\": {\n";
    std::cout << "      \"volatility\": " << qRes.maxSharpePortfolio.volatility << ",\n";
    std::cout << "      \"expectedReturn\": " << qRes.maxSharpePortfolio.expectedReturn << ",\n";
    std::cout << "      \"sharpe\": " << qRes.maxSharpePortfolio.sharpe << ",\n";
    std::cout << "      \"weights\": [";
    for (size_t i = 0; i < qRes.maxSharpePortfolio.weights.size(); i++) {
        std::cout << qRes.maxSharpePortfolio.weights[i] << (i + 1 < qRes.maxSharpePortfolio.weights.size() ? "," : "");
    }
    std::cout << "]\n    },\n";

    std::cout << "    \"minVol\": {\n";
    std::cout << "      \"volatility\": " << qRes.minVolPortfolio.volatility << ",\n";
    std::cout << "      \"expectedReturn\": " << qRes.minVolPortfolio.expectedReturn << ",\n";
    std::cout << "      \"sharpe\": " << qRes.minVolPortfolio.sharpe << ",\n";
    std::cout << "      \"weights\": [";
    for (size_t i = 0; i < qRes.minVolPortfolio.weights.size(); i++) {
        std::cout << qRes.minVolPortfolio.weights[i] << (i + 1 < qRes.minVolPortfolio.weights.size() ? "," : "");
    }
    std::cout << "]\n    },\n";

    std::cout << "    \"curve\": [\n";
    for (size_t i = 0; i < qRes.frontierPoints.size(); i++) {
        const auto& pt = qRes.frontierPoints[i];
        std::cout << "      {\"volatility\": " << pt.volatility << ", \"expectedReturn\": " << pt.expectedReturn << ", \"sharpe\": " << pt.sharpe << "}"
                  << (i + 1 < qRes.frontierPoints.size() ? ",\n" : "\n");
    }
    std::cout << "    ]\n";
    std::cout << "  }\n";
    std::cout << "}\n";

    return 0;
}
