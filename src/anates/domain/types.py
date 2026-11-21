from typing import NewType

SubjectCount = NewType("SubjectCount", int)
ItemCount = NewType("ItemCount", int)
OptionCount = NewType("OptionCount", int)
DegreesOfFreedom = NewType("DegreesOfFreedom", int)


def correlation_degrees_of_freedom(subject_count: SubjectCount) -> DegreesOfFreedom:
    """Return Pearson correlation degrees of freedom (N - 2) from SubjectCount."""
    return DegreesOfFreedom(int(subject_count) - 2)
