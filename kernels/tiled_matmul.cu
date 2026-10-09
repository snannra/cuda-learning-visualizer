#include <cuda_runtime.h>
#define TILE 16

// Square, row-major float32 matrices; launch block(TILE, TILE).
__global__ void tiled_matmul(const float* A, const float* B, float* C, int N) {
    __shared__ float As[TILE][TILE];
    __shared__ float Bs[TILE][TILE];
    int tx = threadIdx.x, ty = threadIdx.y;
    int col = blockIdx.x * TILE + tx;
    int row = blockIdx.y * TILE + ty;
    float sum = 0.0f;
    for (int tile = 0; tile < (N + TILE - 1) / TILE; ++tile) {
        int aCol = tile * TILE + tx;
        int bRow = tile * TILE + ty;
        As[ty][tx] = (row < N && aCol < N) ? A[row * N + aCol] : 0.0f;
        Bs[ty][tx] = (bRow < N && col < N) ? B[bRow * N + col] : 0.0f;
        __syncthreads();
        for (int k = 0; k < TILE; ++k)
            sum += As[ty][k] * Bs[k][tx];
        __syncthreads();
    }
    if (row < N && col < N) C[row * N + col] = sum;
}

// Inputs must already be allocated on the device; N must be positive.
// Caller checks launch errors and synchronizes before consuming results.
void launch_tiled_matmul(const float* d_A, const float* d_B, float* d_C, int N) {
    dim3 block(TILE, TILE);
    dim3 grid((N + TILE - 1) / TILE, (N + TILE - 1) / TILE);
    tiled_matmul<<<grid, block>>>(d_A, d_B, d_C, N);
}
