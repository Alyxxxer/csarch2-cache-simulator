# csarch2-cache-simulator
Submitted by Group 8 [S02]:\
Helaga, Raina\
Lee, Jason Benedict\
Maravilla, Sofia\
Plurad, Venice Raeka\
Ramirez, Diana Angela

## Deployed Website Link
https://alyxxxer.github.io/csarch2-cache-simulator/
## Specifications
The group's Cache Memory Machine intends to simulate how cache memory works with a set of the following common specifications:
- Parameterized Block Size (min. of 2 words, reco. > 16 words, must be a power of 2)
- Parameterized Number of Cache Blocks (min. of 4, reco. > 16 blocks, must be a power of 2)
- Fixed Main Memory (1024 blocks)
- Parameterized Load-Through and Non-Load-Through

## Test Cases
Required: Indicated cache block parameter from the user (n).
a. **Sequential sequence:** Access up to 2n cache blocks. Repeat the sequence two times.
Example [if n = 4]: 0,1,2,3,4,5,6,7, 0,1,2,3,4,5,6,7
b. **Mid-repeat blocks:** Start at block 0 to n-1, then repeat the sequence up to 2n-1 twice. Afterward, reverse the
sequence pattern.
Example [if n = 4]: 0,1,2,3, 0,1,2,3,4,5,6,7, 0,1,2,3,4,5,6,7, 3,2,1,0, 7,6,5,4,3,2,1,0, 7,6,5,4,3,2,1,0
c. **Random sequence:** Generate a random sequence of 64 block accesses (block indices must be within the 0 to
1023 range).

## Expected Output 
a. System Outputs:
- Visual snapshot of the cache memory state.
- A toggle/option to view either a step-by-step animated trace or just the final memory snapshot.
- A text log detailing the cache memory trace (required regardless of whether step-by-step or final snapshot
is chosen).
- Statistical Outputs:
	1) Total memory access count
	2) Cache hit count
	3) Cache miss count
	4) Cache hit rate
	5) Cache miss rate
	6) Average Memory Access Time
	7) Total memory access time

b. Analysis Write-up:
- A detailed analysis of the three test cases, including a comparison of the two cache operations for the specific machine.
- This must be submitted as a README.md file in the GitHub repository.
- Note: Ensure you specify the full specifications and parameters of your cache simulation system in the README.

c. Specific Machine Configurations:
- For Machine 8: Direct Mapped vs. Fully Associative (FA) + MRU


## Application
app.js binds and controls the code for Direct-Mapping, Full Associative Mapping, MRU configuration, and, Load-Through and Non-Load-Through policies. It receives parameters from index.html, and load the appropriate engine. The engine is defaulted to have a non-load-through policy defined by the formula:
- detect + (block size x Main Memory Access Time) + Cache Access Time
	where detect = cache miss
For load-through, it is defined as:
- detect + Main Memory Access Time + Cache Access Time
These formulas are defined in the scripts for direct mapping and full associative mapping.

The engine is rendered into a grid where cells display the valid bit, tag, and data and provides a side-by-side comparison between direct mapping and full-associative mapping cells. For direct-mapped mode, it highlights the most recently accessed line by evaluating line timestamp values, while for fully-associative mode, it highlights the designated MRU (Most Recently Used) line targeted for the next eviction. At the bottom of the grid displays the total access time, number of hits, number of misses, hit rate, miss rate, average access time and total access time defined by the stats parameter.

The play sequence is defined here as well, where the user can see the step-by-step mapping algorithm executed by the cells, or choose the final snapshot. When the machine is run, it reads all UI inputs, instantiate cache engines, generate the three test cases defined in specs, and resets any remaining presets from prior runs. 

a) Step forward
It can be triggered both manually or automatically once the user presses the Step or Play. Its algorithm is defined as:
1. Advance the cursor and update the bus
2. Execute access on both cache engines
3. Re-render visual grids to display the hits (cells highlighted in green) and misses (cells highlighted in red)
4. Append the scrollable trace log
5. Update the statistics window at the bottom of the grid
6. Update the progress counter under the play button

b) Final
It gives the final result by calling the run method defined for each of the mapping algorithms. It renders the final state once all accesses are finished with a complete trace log and displayed final statistics.

## Direct Mapping
direct-mapping.js contains the logic and algorithm for the direct mapping. Direct mapping replacement algorithm is defined that every block in main memory is mapped to exactly one specific cache line. With the use of tag, the system verifies if the data sitting in the line is the data the CPU actually requested. The script involves the core engine functions, state reporting functions (reset(), snapshot() and getStats()), and validation functions (validateConfig() and addressLayout()).

## Full Associative Mapping
This replacement algorithm can be placed into any available slot in the cache, to define which cache line should the data be mapped, it uses the Most Recently Used replacement policy where the algorithm evicts the block that was accessed most recently when the cache is full. It has its own core engine functions, state reporting functions, and validation functions that operate similarly to direct mapping.

# Test Cases
Following the suggested number of parameters the comparison between the two algorithms are defined:
- **Cache Blocks = 32**
- **Block Size = 64**

A hit is defined as the block successfully mapped into cache while the miss is defined into two categories:

- Compulsory miss = cache line is empty
- Capacity miss = a cache line's previously mapped block is evicted based on the replacement algorithm.

## Test Case 1: Sequential (2n * 2)
- The algorithms finished at a total of 128 accesses (64 blocks * 2 = 128).

### Direct Mapping 
All blocks are a miss due to the fact that the number of block size in words is double the size of the cache block size. Once blocks 0-31 were mapped in the cache, resulting in a compulsory miss, 32-63 were mapped to cache blocks 0 to 63, resulting in a conflict or capacity miss. This will behavior will be reiterated with the second iteration for blocks 0-63. 
- Hits  = 0
- Misses = 128
- Hit rate = 0%
- Miss rate = 100%
- Average access time (Non-Load-Through) = 642 cycles
- Total access time (Non-Load-Through) = 82176 cycles
- Average access time (Load-Through) = 12 cycles
- Total access time (Load-Through) = 1536 cycles

### Full Associative: MRU
For blocks 0-31, they are compulsory misses, then for 32-63, FA:MRU will continuously replace cache line 31. When the second iteration hits, blocks 0-30 will hit considering they weren't replaced by the algorithm. 31-62 will be a miss, consistently replacing cache line 30 until 63, since the mapping was not replaced in cache line 31. 
- Hits  = 32
- Misses = 96
- Hit rate = 25%
- Miss rate = 75%
- Average access time (Non-Load-Through) = 481.75 cycles
- Total access time (Non-Load-Through) = 61664 cycles
- Average access time (Load-Through) = 9.25 cycles
- Total access time (Load-Through) = 1184 cycles

## Test Case 2
- The algorithms finished at a total of 320 accesses (2 * 32 + 4 * 64 = 320).

### Direct Mapping
For blocks 0-31, it will be an expected compulsory miss, but from the first iteration of 0-63, the first half will be a hit since 0-31 have been properly mapped from the compulsory misses. Blocks 32-63 will be a miss, replacing the prior mapped blocks from 0-31. The second iteration of 0-63 will all be capacity misses where 0-31 will replace the prior's 32-63, before being replaced by the latter's 32-63. For the first iteration of 31-0 to all of the following iterations of 63-0, will be capacity misses. From the last iteration 0f 0-63, 32-63 will occupy all 32 cache blocks only to be replaced with 31-0. 31-0 will be later replaced by 63-32 from the first iteration of 63-0, later replaced by the current iteration's 31-0. The self-replacing behavior will be present in the second iteration.
- Hits  = 32
- Misses = 288
- Hit rate = 10%
- Miss rate = 90%
- Average access time (Non-Load-Through) = 577.90 cycles
- Total access time (Non-Load-Through) = 184928 cycles
- Average access time (Load-Through) = 10.90 cycles
- Total access time (Load-Through) = 3488 cycles

### Full Associative: MRU
Like Direct Mapping, blocks 0-31 will be compulsory miss and the first half of 0-63 will be a hit. The remaining blocks, 32-63, will continuously replace cache block 31. Once the second iteration of 0-63 comes in, it will be continuous hits from 0-30, since those blocks were not replaced. 31-62 will be capacity misses, continuously replacing cache block 30 since it is the last-accessed block. 63 will be a hit since it was left untouched in cache block 31. For 31-0, blocks 31 and 30 will be misses and replaced in cache block 31. The remaining blocks will be hits, leaving the last accessed block, cache block 0, with a value of 0. From 63-0, 63 will replace 0 in cache block 0, a hit for block 62 in cache block 30, before it gets continuously replaced from 61 to 31. Cache block 31 holds 30, while blocks 29-1 will be a hit respectively. Since cache block 0 previously contained 63, block 0 will be a capacity miss and will replace 1 in cache block one. For the last iteration of 63-0, 63 will be a hit, before it will be continuously be replaced in cache block 0 from blocks 62-32. Blocks 31-2 are hits, 1 is a capacity miss and will replace 2 in cache block 2, and 0 is a hit in cache block 0.
- Hits  = 157
- Misses = 163
- Hit rate = 49.06%
- Miss rate = 50.94%
- Average access time (Non-Load-Through) = 327.51 cycles
- Total access time (Non-Load-Through) = 104803 cycles
- Average access time (Load-Through) = 6.60 cycles
- Total access time (Load-Through) = 2113 cycles

## Test Case 3
- The algorithms finished at a total of 64 accesses (fixed).

Considering that test case 3 involves a game of chance, ten test cases were executed, five for each cache policy.

| Iterations | DM - Hits | FA:MRU - Hits | DM - Miss | FA:MRU - Miss | DM - Hit Rate (%) | FA:MRU - Hit Rate (%) | DM - Miss Rate (%) | FA:MRU - Miss Rate (%) | DM - AAT (cyc) | FA:MRU - AAT (cyc) | DM - TAL (cyc) | FA:MRU - TAL (cyc) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| NLT - 1 | 1 | 1 | 63 | 63 | 1.56 | 1.56 | 98.44 | 98.44 | 631.98 | 631.98 | 40447 | 40447 |
| NLT - 2 | 2 | 4 | 62 | 60 | 3.13 | 6.25 | 96.88 | 93.75 | 621.97 | 601.94 | 39806 | 38524 |
| NLT - 3 | 1 | 3 | 63 | 61 | 1.56 | 4.69 | 98.44 | 95.31 | 631.98 | 611.95 | 40447 | 39165 |
| NLT - 4 | 3 | 2 | 61 | 62 | 4.69 | 3.13 | 95.31 | 96.88 | 611.95 | 621.97 | 39165 | 39806 |
| NLT - 5 | 1 | 2 | 63 | 62 | 1.56 | 3.13 | 98.44 | 96.88 | 631.98 | 621.97 | 40447 | 39806 |
| LT - 1  | 1 | 1 | 63 | 63 | 1.56 | 1.56 | 98.44 | 98.44 | 11.83  | 11.83  | 757   | 757   |
| LT - 2  | 1 | 2 | 63 | 62 | 1.56 | 3.13 | 98.44 | 96.88 | 11.83  | 11.66  | 757   | 746   |
| LT - 3  | 0 | 1 | 64 | 63 | 0    | 1.56 | 100   | 98.44 | 12     | 11.83  | 768   | 757   |
| LT - 4  | 0 | 1 | 64 | 63 | 0    | 1.56 | 100   | 98.44 | 12     | 11.83  | 768   | 757   |
| LT - 5  | 2 | 1 | 62 | 63 | 3.13 | 1.56 | 96.88 | 98.44 | 11.66  | 11.83  | 746   | 757   |

It is notable that both algorithms have poor hit rates, only reaching a max of 4 hits. This is expected considering randomly generated blocks from 0-1023 would rarely produce the same number in only 64 block accesses. But despite that, full associative managed to perform better in terms of getting hits based of the probabilities:

- Same hits and misses = 2/10 = 20%
- DM hits > FA:MRU hits = 2/10 = 20%
- DM hits < FA:MRU hits = 6/10 = 60%

This also displays the efficiency between non-load-Through and load-through. This can be observed for all test cases where non-load-through is significantly greater in magnitude due to its need to wait for the entire block to transfer from the main memory, especially in misses. Load-through does not have this problem, and only penalizes the ones with hits.
