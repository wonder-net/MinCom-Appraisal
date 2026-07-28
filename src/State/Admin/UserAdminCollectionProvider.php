<?php

declare(strict_types=1);

namespace App\State\Admin;

use ApiPlatform\Metadata\Operation;
use ApiPlatform\State\ProviderInterface;
use App\ApiResource\Admin\UserAdminResource;
use App\ApiResource\Admin\UserAdminResourceFactory;
use App\Enum\RoleName;
use App\Repository\UserRepository;
use App\Service\OffsetPaginationLinkBuilder;
use Symfony\Component\HttpFoundation\Request;

/**
 * Port of AdminUserListCreateView.get(): page-number pagination (matching
 * StandardOffsetPagination) plus the same search/role/is_active filters.
 *
 * API Platform's own collection pagination is disabled for this operation
 * (see UserAdminResource) — its Hydra/page-based shape has no clean path to
 * our {results, pagination} envelope, so this provider paginates manually
 * and hands the metadata to EnvelopeResponseSubscriber via a request
 * attribute instead.
 */
final class UserAdminCollectionProvider implements ProviderInterface
{
    private const DEFAULT_PAGE_SIZE = 20;
    private const MAX_PAGE_SIZE = 100;

    public function __construct(
        private readonly UserRepository $users,
        private readonly UserAdminResourceFactory $resourceFactory,
        private readonly OffsetPaginationLinkBuilder $pagination,
    ) {
    }

    /**
     * @return list<UserAdminResource>
     */
    public function provide(Operation $operation, array $uriVariables = [], array $context = []): array
    {
        /** @var Request $request */
        $request = $context['request'];

        $page = max(1, (int) $request->query->get('page', '1'));
        $pageSize = min(self::MAX_PAGE_SIZE, max(1, (int) $request->query->get('page_size', (string) self::DEFAULT_PAGE_SIZE)));

        $search = trim((string) $request->query->get('search', ''));
        $search = $search === '' ? null : substr($search, 0, 100);

        $role = RoleName::tryFrom(trim((string) $request->query->get('role', '')));

        $isActiveParam = strtolower(trim((string) $request->query->get('is_active', '')));
        $isActive = match ($isActiveParam) {
            'true' => true,
            'false' => false,
            default => null,
        };

        $result = $this->users->searchAdminUsers($search, $role, $isActive, $page, $pageSize);

        $request->attributes->set('pagination', $this->pagination->build($request, $result['count'], $page, $pageSize));

        return array_map($this->resourceFactory->fromEntity(...), $result['items']);
    }
}
