import { createLocalRepository } from './localRepository'
import { describeRepositoryContract } from './repositoryContract'

// No cases of its own: this adapter has no behaviour beyond being the contract,
// implemented. Anything it did differently would be a bug rather than a feature.
describeRepositoryContract('localRepository', createLocalRepository)
