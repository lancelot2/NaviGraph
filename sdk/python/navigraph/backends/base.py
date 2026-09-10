"""The single interface both backends implement."""

from __future__ import annotations

from typing import Optional, Protocol, Union, runtime_checkable

from ..types import ContextResult


@runtime_checkable
class Backend(Protocol):
    """A source of navigation context.

    Two interchangeable implementations exist — ``HostedBackend`` (calls the
    hosted API) and ``OfflineBackend`` (runs locally from a bundle) — so callers
    depend only on this method.
    """

    def context(
        self,
        instruction: str,
        *,
        image: Optional[Union[bytes, str]] = None,
        current_location: Optional[str] = None,
    ) -> ContextResult:
        """Return navigation context for an instruction.

        Supply ``current_location`` (a room name/id) to skip localization
        entirely — the zero-vision path. Otherwise pass a camera frame as
        ``image`` for localization where the backend supports it.
        """
        ...
